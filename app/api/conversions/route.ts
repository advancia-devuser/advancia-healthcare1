import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet, creditWallet } from "@/lib/ledger";

type QuotePayload = {
  toAmount: string;
  rate: string | number;
  fee: string | number;
  source: string;
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseChainId(value: unknown): number | null {
  const parsed = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizePositiveAmount(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  if (BigInt(raw) <= BigInt(0)) {
    return null;
  }
  return raw;
}

function parseQuotePayload(data: unknown): QuotePayload | null {
  if (!data || typeof data !== "object" || !("quote" in data)) {
    return null;
  }
  const quote = (data as { quote?: unknown }).quote;
  if (!quote || typeof quote !== "object") {
    return null;
  }

  const toAmount = normalizePositiveAmount((quote as { toAmount?: unknown }).toAmount);
  const source = normalizeNonEmptyString((quote as { source?: unknown }).source);
  const rate = (quote as { rate?: unknown }).rate;
  const fee = (quote as { fee?: unknown }).fee;

  if (!toAmount || !source || (typeof rate !== "string" && typeof rate !== "number") || (typeof fee !== "string" && typeof fee !== "number")) {
    return null;
  }

  return {
    toAmount,
    source,
    rate,
    fee,
  };
}

/**
 * GET /api/conversions?page=1&limit=20
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInteger(searchParams.get("limit"), 20));

    const [conversions, total] = await Promise.all([
      prisma.conversion.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.conversion.count({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({ conversions, total, page, limit });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/conversions
 * Body: { fromAsset, toAsset, fromAmount, chainId }
 *
 * Executes swap via converter agent:
 *   1) Debit fromAsset from user's ledger
 *   2) Credit toAsset to user's ledger (using aggregator rate)
 *   3) Record conversion + transaction + audit log
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { fromAsset, toAsset, fromAmount, chainId } = body as {
      fromAsset?: unknown;
      toAsset?: unknown;
      fromAmount?: unknown;
      chainId?: unknown;
    };

    const normalizedFromAsset = normalizeNonEmptyString(fromAsset)?.toUpperCase();
    const normalizedToAsset = normalizeNonEmptyString(toAsset)?.toUpperCase();
    const normalizedFromAmount = normalizePositiveAmount(fromAmount);
    const normalizedChainId = parseChainId(chainId);

    if (!normalizedFromAsset || !normalizedToAsset || !normalizedFromAmount || !normalizedChainId) {
      return NextResponse.json(
        { error: "fromAsset, toAsset, fromAmount, and chainId are required" },
        { status: 400 }
      );
    }

    if (normalizedFromAsset === normalizedToAsset) {
      return NextResponse.json({ error: "fromAsset and toAsset must be different" }, { status: 400 });
    }

    // Get quote from converter agent
    const quoteRes = await fetch(
      `${getBaseUrl(request)}/api/cron/convert?fromAsset=${normalizedFromAsset}&toAsset=${normalizedToAsset}&fromAmount=${normalizedFromAmount}&chainId=${normalizedChainId}`
    );
    const quoteData: unknown = await quoteRes.json();
    const parsedQuote = parseQuotePayload(quoteData);
    if (!quoteRes.ok || !parsedQuote) {
      return NextResponse.json(
        {
          error:
            quoteData && typeof quoteData === "object" && "error" in quoteData
              ? String((quoteData as { error?: unknown }).error || "Failed to get quote")
              : "Failed to get quote",
        },
        { status: 400 }
      );
    }

    const { toAmount, rate, fee, source } = parsedQuote;

    // Debit fromAsset from internal ledger
    await debitWallet({
      userId: user.id,
      asset: normalizedFromAsset,
      amount: normalizedFromAmount,
      chainId: normalizedChainId,
      type: "CONVERT",
      status: "CONFIRMED",
      meta: { conversionTo: normalizedToAsset, rate, fee },
    });

    // Credit toAsset to internal ledger
    await creditWallet({
      userId: user.id,
      asset: normalizedToAsset,
      amount: toAmount,
      chainId: normalizedChainId,
      type: "RECEIVE",
      status: "CONFIRMED",
      meta: { conversionFrom: normalizedFromAsset, rate, source },
    });

    // Record conversion
    const conversion = await prisma.conversion.create({
      data: {
        userId: user.id,
        fromAsset: normalizedFromAsset,
        toAsset: normalizedToAsset,
        fromAmount: normalizedFromAmount,
        toAmount: String(toAmount),
        chainId: normalizedChainId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "CONVERSION",
        meta: JSON.stringify({
          conversionId: conversion.id,
          fromAsset: normalizedFromAsset,
          toAsset: normalizedToAsset,
          fromAmount: normalizedFromAmount,
          toAmount,
          rate,
          fee,
          source,
        }),
      },
    });

    return NextResponse.json({ conversion, rate, fee, source }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Extract base URL from request for internal API calls */
function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
