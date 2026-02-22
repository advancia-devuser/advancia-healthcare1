import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createWallet } from "@/lib/ledger";

/**
 * GET /api/wallets — get the current user's wallet
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });
    const balances = await prisma.walletBalance.findMany({
      where: { userId: user.id },
      orderBy: { asset: "asc" },
      select: { asset: true, balance: true, updatedAt: true },
    });
    const ethBalance = balances.find((b) => b.asset === "ETH")?.balance ?? "0";
    return NextResponse.json({ wallet: wallet ? { ...wallet, balance: ethBalance } : wallet, balances });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/wallets — create / link wallet
 * Body: { smartAccountAddress: string, chainId: number }
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { smartAccountAddress, chainId } = await request.json();

    if (!smartAccountAddress || !chainId) {
      return NextResponse.json(
        { error: "smartAccountAddress and chainId are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });

    if (existing) {
      // Update if chain changed
      const wallet = await prisma.wallet.update({
        where: { id: existing.id },
        data: { smartAccountAddress, chainId },
      });

      // Ensure default ledger row exists
      await createWallet(user.id, "ETH");

      return NextResponse.json({ wallet });
    }

    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        smartAccountAddress,
        chainId,
      },
    });

    // Ensure default ledger row exists
    await createWallet(user.id, "ETH");

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "WALLET_CREATED",
        meta: JSON.stringify({ smartAccountAddress, chainId }),
      },
    });

    return NextResponse.json({ wallet }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
