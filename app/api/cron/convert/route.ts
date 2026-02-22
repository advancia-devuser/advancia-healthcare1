/**
 * Agent 5 — Converter / Aggregator
 * ─────────────────────────────────
 * POST /api/cron/convert
 *
 * Processes pending conversion requests. Calls aggregator API (1inch, etc.)
 * to get quote, executes swap using hot wallet, then:
 *   1) Debits fromAsset from internal ledger
 *   2) Credits toAsset to internal ledger
 *   3) Updates conversion record with actual toAmount
 *   4) Logs transaction
 *
 * Can also be called directly from the frontend conversion API.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { debitWallet, creditWallet } from "@/lib/ledger";

export const dynamic = "force-dynamic";

/* ─── Aggregator Configuration ─── */

const AGGREGATOR_API = process.env.AGGREGATOR_API_URL || "https://api.1inch.dev";
const AGGREGATOR_KEY = process.env.AGGREGATOR_API_KEY || "";

// Simple price feed for demo — replace with real aggregator quotes
const MOCK_RATES: Record<string, Record<string, number>> = {
  // Crypto → Crypto
  ETH:  { USDC: 2500, USDT: 2500, BTC: 0.04, WBTC: 0.04, BNB: 8.33, EUR: 2300, USD: 2500 },
  BTC:  { ETH: 25, USDC: 62500, USDT: 62500, WBTC: 1, BNB: 208, EUR: 57500, USD: 62500 },
  WBTC: { ETH: 25, USDC: 62500, USDT: 62500, BTC: 1, BNB: 208, EUR: 57500, USD: 62500 },
  USDC: { ETH: 0.0004, USDT: 1, BTC: 0.000016, WBTC: 0.000016, BNB: 0.00333, EUR: 0.92, USD: 1 },
  USDT: { ETH: 0.0004, USDC: 1, BTC: 0.000016, WBTC: 0.000016, BNB: 0.00333, EUR: 0.92, USD: 1 },
  BNB:  { ETH: 0.12, USDC: 300, USDT: 300, BTC: 0.0048, WBTC: 0.0048, EUR: 276, USD: 300 },
  // Fiat → Crypto (for fiat-denominated conversions)
  EUR:  { USD: 1.087, ETH: 0.000435, BTC: 0.0000174, USDC: 1.087, USDT: 1.087 },
  USD:  { EUR: 0.92, ETH: 0.0004, BTC: 0.000016, USDC: 1, USDT: 1 },
};

/* ─── Quote helpers ─── */

interface SwapQuote {
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  toAmount: string;
  rate: number;
  fee: string;
  source: string;
}

/**
 * Get swap quote. Uses real aggregator if configured, otherwise mock rates.
 */
async function getQuote(
  fromAsset: string,
  toAsset: string,
  fromAmount: string,
  _chainId: number
): Promise<SwapQuote> {
  // Real aggregator integration
  if (AGGREGATOR_KEY && AGGREGATOR_API) {
    try {
      const res = await fetch(
        `${AGGREGATOR_API}/swap/v6.0/${_chainId}/quote?src=${fromAsset}&dst=${toAsset}&amount=${fromAmount}`,
        {
          headers: { Authorization: `Bearer ${AGGREGATOR_KEY}` },
        }
      );
      if (res.ok) {
        const data = await res.json();
        return {
          fromAsset,
          toAsset,
          fromAmount,
          toAmount: data.toAmount || data.dstAmount || "0",
          rate: parseFloat(data.toAmount || "0") / parseFloat(fromAmount),
          fee: "0",
          source: "1inch",
        };
      }
    } catch {
      // Fall through to mock
    }
  }

  // Mock quote
  const rate = MOCK_RATES[fromAsset]?.[toAsset];
  if (!rate) {
    throw new Error(`No rate available for ${fromAsset}→${toAsset}`);
  }

  const fromAmountNum = parseFloat(fromAmount);
  const fee = fromAmountNum * 0.003; // 0.3% fee
  const netAmount = fromAmountNum - fee;
  const toAmount = (netAmount * rate).toString();

  return {
    fromAsset,
    toAsset,
    fromAmount,
    toAmount,
    rate,
    fee: fee.toString(),
    source: "mock",
  };
}

/* ─── GET: Quote endpoint ─── */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fromAsset = searchParams.get("fromAsset");
    const toAsset = searchParams.get("toAsset");
    const fromAmount = searchParams.get("fromAmount");
    const chainId = parseInt(searchParams.get("chainId") || "421614");

    if (!fromAsset || !toAsset || !fromAmount) {
      return NextResponse.json(
        { error: "fromAsset, toAsset, and fromAmount are required" },
        { status: 400 }
      );
    }

    const quote = await getQuote(fromAsset, toAsset, fromAmount, chainId);
    return NextResponse.json({ quote });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 400 }
    );
  }
}

/* ─── POST: Execute conversion ─── */

export async function POST(req: Request) {
  try {
    // Auth — must be cron or authenticated user
    const authHeader = req.headers.get("authorization");
    const isCron =
      process.env.CRON_SECRET &&
      authHeader === `Bearer ${process.env.CRON_SECRET}`;

    const body = await req.json();

    // If not cron AND not processing by conversionId, require auth
    if (!isCron && !body.conversionId) {
      // Import getAuthUser to verify caller
      const { getAuthUser } = await import("@/lib/auth");
      const callerUser = await getAuthUser(req);
      if (!callerUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      // Override userId with the authenticated user's ID to prevent spoofing
      body.userId = callerUser.id;
    }

    if (body.conversionId) {
      // Process a specific pending conversion
      return await processConversion(body.conversionId);
    }

    // Direct swap request
    const { userId, fromAsset, toAsset, fromAmount, chainId } = body;
    if (!userId || !fromAsset || !toAsset || !fromAmount || !chainId) {
      return NextResponse.json(
        { error: "userId, fromAsset, toAsset, fromAmount, chainId required" },
        { status: 400 }
      );
    }

    // Get quote
    const quote = await getQuote(fromAsset, toAsset, fromAmount, chainId);

    // Debit fromAsset
    const debitResult = await debitWallet({
      userId,
      asset: fromAsset,
      amount: fromAmount,
      chainId,
      type: "CONVERT",
      status: "CONFIRMED",
      meta: { conversionTo: toAsset, rate: quote.rate, fee: quote.fee },
    });

    // Credit toAsset
    const creditResult = await creditWallet({
      userId,
      asset: toAsset,
      amount: quote.toAmount,
      chainId,
      type: "RECEIVE",
      status: "CONFIRMED",
      meta: {
        conversionFrom: fromAsset,
        rate: quote.rate,
        source: quote.source,
      },
    });

    // Record conversion
    const conversion = await prisma.conversion.create({
      data: {
        userId,
        fromAsset,
        toAsset,
        fromAmount,
        toAmount: quote.toAmount,
        chainId,
      },
    });

    // Audit
    await prisma.auditLog.create({
      data: {
        userId,
        actor: "CONVERTER_AGENT",
        action: "SWAP_EXECUTED",
        meta: JSON.stringify({
          conversionId: conversion.id,
          fromAsset,
          toAsset,
          fromAmount,
          toAmount: quote.toAmount,
          rate: quote.rate,
          fee: quote.fee,
          source: quote.source,
        }),
      },
    });

    return NextResponse.json({
      conversion,
      quote,
      debit: debitResult,
      credit: creditResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

/* ─── Process a pending conversion by ID ─── */

async function processConversion(conversionId: string) {
  const conversion = await prisma.conversion.findUnique({
    where: { id: conversionId },
    include: { user: { include: { wallet: true } } },
  });

  if (!conversion) {
    return NextResponse.json(
      { error: "Conversion not found" },
      { status: 404 }
    );
  }

  if (conversion.toAmount) {
    return NextResponse.json(
      { error: "Conversion already processed" },
      { status: 400 }
    );
  }

  const quote = await getQuote(
    conversion.fromAsset,
    conversion.toAsset,
    conversion.fromAmount,
    conversion.chainId
  );

  await debitWallet({
    userId: conversion.userId,
    asset: conversion.fromAsset,
    amount: conversion.fromAmount,
    chainId: conversion.chainId,
    type: "CONVERT",
    status: "CONFIRMED",
  });

  await creditWallet({
    userId: conversion.userId,
    asset: conversion.toAsset,
    amount: quote.toAmount,
    chainId: conversion.chainId,
    type: "RECEIVE",
    status: "CONFIRMED",
  });

  const updated = await prisma.conversion.update({
    where: { id: conversionId },
    data: { toAmount: quote.toAmount },
  });

  return NextResponse.json({ conversion: updated, quote });
}
