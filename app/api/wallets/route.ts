import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createWallet } from "@/lib/ledger";

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function parsePositiveChainId(value: unknown): number | null {
  const parsed = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { smartAccountAddress, chainId } = body as {
      smartAccountAddress?: unknown;
      chainId?: unknown;
    };

    const normalizedSmartAccountAddress = normalizeNonEmptyString(smartAccountAddress);
    const normalizedChainId = parsePositiveChainId(chainId);

    if (!normalizedSmartAccountAddress || !normalizedChainId) {
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
        data: { smartAccountAddress: normalizedSmartAccountAddress, chainId: normalizedChainId },
      });

      // Ensure default ledger row exists
      await createWallet(user.id, "ETH");

      return NextResponse.json({ wallet });
    }

    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        smartAccountAddress: normalizedSmartAccountAddress,
        chainId: normalizedChainId,
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
        meta: JSON.stringify({ smartAccountAddress: normalizedSmartAccountAddress, chainId: normalizedChainId }),
      },
    });

    return NextResponse.json({ wallet }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
