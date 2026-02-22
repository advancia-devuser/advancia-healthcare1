import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet, creditWallet } from "@/lib/ledger";

/**
 * GET /api/conversions?page=1&limit=20
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

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
    const { fromAsset, toAsset, fromAmount, chainId } =
      await request.json();

    if (!fromAsset || !toAsset || !fromAmount || !chainId) {
      return NextResponse.json(
        { error: "fromAsset, toAsset, fromAmount, and chainId are required" },
        { status: 400 }
      );
    }

    // Get quote from converter agent
    const quoteRes = await fetch(
      `${getBaseUrl(request)}/api/cron/convert?fromAsset=${fromAsset}&toAsset=${toAsset}&fromAmount=${fromAmount}&chainId=${chainId}`
    );
    const quoteData = await quoteRes.json();
    if (!quoteData.quote) {
      return NextResponse.json(
        { error: quoteData.error || "Failed to get quote" },
        { status: 400 }
      );
    }

    const { toAmount, rate, fee, source } = quoteData.quote;

    // Debit fromAsset from internal ledger
    await debitWallet({
      userId: user.id,
      asset: fromAsset,
      amount: fromAmount,
      chainId,
      type: "CONVERT",
      status: "CONFIRMED",
      meta: { conversionTo: toAsset, rate, fee },
    });

    // Credit toAsset to internal ledger
    await creditWallet({
      userId: user.id,
      asset: toAsset,
      amount: toAmount,
      chainId,
      type: "RECEIVE",
      status: "CONFIRMED",
      meta: { conversionFrom: fromAsset, rate, source },
    });

    // Record conversion
    const conversion = await prisma.conversion.create({
      data: {
        userId: user.id,
        fromAsset,
        toAsset,
        fromAmount: String(fromAmount),
        toAmount: String(toAmount),
        chainId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "CONVERSION",
        meta: JSON.stringify({
          conversionId: conversion.id,
          fromAsset,
          toAsset,
          fromAmount,
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
