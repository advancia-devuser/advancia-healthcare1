import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TransactionType } from "@prisma/client";

/**
 * GET /api/payments/history?page=1&limit=20&type=SEND|RECEIVE|all
 * Returns paginated payment transaction history for the authenticated user.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));
    const type = searchParams.get("type") || "all";

    const typeFilter: { type?: TransactionType | { in: TransactionType[] } } =
      type === "SEND"
        ? { type: TransactionType.SEND }
        : type === "RECEIVE"
        ? { type: TransactionType.RECEIVE }
        : { type: { in: [TransactionType.SEND, TransactionType.RECEIVE, TransactionType.WITHDRAW, TransactionType.CONVERT, TransactionType.BUY] } };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          ...typeFilter,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          status: true,
          from: true,
          to: true,
          asset: true,
          amount: true,
          txHash: true,
          chainId: true,
          createdAt: true,
        },
      }),
      prisma.transaction.count({
        where: {
          userId: user.id,
          ...typeFilter,
        },
      }),
    ]);

    return NextResponse.json({
      transactions,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
