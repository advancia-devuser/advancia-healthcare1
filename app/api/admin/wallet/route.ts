import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DEFAULT_WALLET_LABEL = "Platform Treasury";

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function parseNonNegativeBigIntString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  try {
    return BigInt(normalized).toString();
  } catch {
    return null;
  }
}

function parsePositiveBigIntString(value: unknown): string | null {
  const normalized = parseNonNegativeBigIntString(value);
  if (!normalized) {
    return null;
  }

  return BigInt(normalized) > BigInt(0) ? normalized : null;
}

/**
 * GET /api/admin/wallet — list all admin/treasury wallets + recent admin transactions
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [wallets, transactions, totals] = await Promise.all([
      prisma.adminWallet.findMany({ orderBy: { asset: "asc" } }),
      prisma.adminTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      // Fetch revenue transactions for manual aggregation
      prisma.adminTransaction.findMany({
        where: { type: { in: ["FEE_COLLECTED", "SUBSCRIPTION_FEE"] } },
        select: { asset: true, amount: true },
      }),
    ]);

    // Platform-wide stats
    const [totalUsers, totalSubscriptions, totalBookings] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.booking.count(),
    ]);

    // Manually aggregate revenue by asset
    const revenueByAsset: Record<string, string> = {};
    for (const t of totals) {
      revenueByAsset[t.asset] = addBigInt(revenueByAsset[t.asset] || "0", t.amount);
    }

    return NextResponse.json({
      wallets,
      transactions,
      revenue: revenueByAsset,
      stats: { totalUsers, totalSubscriptions, totalBookings },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch admin wallet data" }, { status: 500 });
  }
}

/**
 * POST /api/admin/wallet — initialize or credit admin wallet
 * Body: { asset, amount?, label?, address? }
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { asset, amount, label, address } = body as {
      asset?: unknown;
      amount?: unknown;
      label?: unknown;
      address?: unknown;
    };

    const normalizedAsset = normalizeNonEmptyString(asset);
    if (!normalizedAsset) {
      return NextResponse.json({ error: "asset is required" }, { status: 400 });
    }

    const normalizedLabel = normalizeNonEmptyString(label) || DEFAULT_WALLET_LABEL;

    const normalizedAddress = address === undefined || address === null
      ? undefined
      : normalizeNonEmptyString(address);

    if (address !== undefined && address !== null && !normalizedAddress) {
      return NextResponse.json({ error: "address must be a non-empty string" }, { status: 400 });
    }

    let normalizedAmount: string | undefined;
    if (amount !== undefined && amount !== null) {
      normalizedAmount = parseNonNegativeBigIntString(amount) || undefined;
      if (!normalizedAmount) {
        return NextResponse.json({ error: "amount must be a non-negative integer string" }, { status: 400 });
      }
    }

    const existingWallet = await prisma.adminWallet.findFirst({
      where: { label: normalizedLabel, asset: normalizedAsset },
    });

    const createBalance = normalizedAmount || "0";
    const updateBalance = normalizedAmount
      ? addBigInt(existingWallet?.balance || "0", normalizedAmount)
      : undefined;

    const wallet = await prisma.adminWallet.upsert({
      where: { label_asset: { label: normalizedLabel, asset: normalizedAsset } },
      create: {
        label: normalizedLabel,
        asset: normalizedAsset,
        balance: createBalance,
        address: normalizedAddress || null,
      },
      update: {
        ...(updateBalance ? { balance: updateBalance } : {}),
        ...(normalizedAddress !== undefined ? { address: normalizedAddress } : {}),
      },
    });

    if (normalizedAmount && BigInt(normalizedAmount) > BigInt(0)) {
      await prisma.adminTransaction.create({
        data: {
          walletLabel: normalizedLabel,
          asset: normalizedAsset,
          amount: normalizedAmount,
          type: "CREDIT",
          description: "Manual admin wallet credit",
        },
      });
    }

    return NextResponse.json({ wallet });
  } catch {
    return NextResponse.json({ error: "Failed to update admin wallet" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/wallet — debit admin wallet (for payouts, etc.)
 * Body: { asset, amount, label?, description?, reference? }
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { asset, amount, label, description, reference } = body as {
      asset?: unknown;
      amount?: unknown;
      label?: unknown;
      description?: unknown;
      reference?: unknown;
    };

    const normalizedAsset = normalizeNonEmptyString(asset);
    if (!normalizedAsset) {
      return NextResponse.json({ error: "asset is required" }, { status: 400 });
    }

    const normalizedAmount = parsePositiveBigIntString(amount);
    if (!normalizedAmount) {
      return NextResponse.json({ error: "amount must be a positive integer string" }, { status: 400 });
    }

    const normalizedLabel = normalizeNonEmptyString(label) || DEFAULT_WALLET_LABEL;

    const normalizedDescription =
      description === undefined || description === null
        ? "Admin withdrawal"
        : normalizeNonEmptyString(description);

    if (description !== undefined && description !== null && !normalizedDescription) {
      return NextResponse.json({ error: "description must be a non-empty string" }, { status: 400 });
    }

    const normalizedReference =
      reference === undefined || reference === null
        ? null
        : normalizeNonEmptyString(reference);

    if (reference !== undefined && reference !== null && !normalizedReference) {
      return NextResponse.json({ error: "reference must be a non-empty string" }, { status: 400 });
    }

    const wallet = await prisma.adminWallet.findFirst({ where: { label: normalizedLabel, asset: normalizedAsset } });
    if (!wallet) {
      return NextResponse.json({ error: "Admin wallet not found for this asset" }, { status: 404 });
    }

    if (BigInt(wallet.balance) < BigInt(normalizedAmount)) {
      return NextResponse.json({ error: "Insufficient admin wallet balance" }, { status: 400 });
    }

    const updated = await prisma.adminWallet.update({
      where: { id: wallet.id },
      data: { balance: subBigInt(wallet.balance, normalizedAmount) },
    });

    await prisma.adminTransaction.create({
      data: {
        walletLabel: normalizedLabel,
        asset: normalizedAsset,
        amount: normalizedAmount,
        type: "DEBIT",
        description: normalizedDescription,
        reference: normalizedReference,
      },
    });

    return NextResponse.json({ wallet: updated });
  } catch {
    return NextResponse.json({ error: "Failed to debit admin wallet" }, { status: 500 });
  }
}

/* ─── Helpers ─── */
function addBigInt(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}
function subBigInt(a: string, b: string): string {
  return (BigInt(a) - BigInt(b)).toString();
}
