import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyUserPin } from "@/lib/pin-verify";

/**
 * GET /api/withdrawals?page=1&limit=20
 * User: list own withdrawals.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.withdrawal.count({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({ withdrawals, total, page, limit });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/withdrawals
 * Body: { amount, asset?, toAddress, chainId }
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { amount, asset, toAddress, chainId, pin } = await request.json();

    if (!amount || !toAddress || !chainId) {
      return NextResponse.json(
        { error: "amount, toAddress, and chainId are required" },
        { status: 400 }
      );
    }

    // Require PIN for withdrawals
    const pinError = await verifyUserPin(user, pin);
    if (pinError) return pinError;

    const withdrawal = await prisma.withdrawal.create({
      data: {
        userId: user.id,
        amount: String(amount),
        asset: asset || "ETH",
        toAddress,
        chainId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "WITHDRAWAL_REQUESTED",
        meta: JSON.stringify({ amount, asset: asset || "ETH", toAddress }),
      },
    });

    return NextResponse.json({ withdrawal }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
