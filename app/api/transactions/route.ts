import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/transactions?page=1&limit=20
 * Returns the current user's transactions.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({ transactions, total, page, limit });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/transactions
 * Body: { type, from?, to?, asset?, amount, txHash?, chainId }
 * Record a new transaction.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();

    const { type, from, to, asset, amount, txHash, chainId } = body;
    if (!type || !amount || !chainId) {
      return NextResponse.json(
        { error: "type, amount, and chainId are required" },
        { status: 400 }
      );
    }

    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        type,
        from: from || null,
        to: to || null,
        asset: asset || "ETH",
        amount: String(amount),
        txHash: txHash || null,
        chainId,
        status: txHash ? "CONFIRMED" : "PENDING",
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: `TX_${type}`,
        meta: JSON.stringify({ amount, asset: asset || "ETH", txHash }),
      },
    });

    return NextResponse.json({ transaction: tx }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
