import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/wallet — list all admin/treasury wallets + recent admin transactions
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
}

/**
 * POST /api/admin/wallet — initialize or credit admin wallet
 * Body: { asset, amount?, label?, address? }
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { asset, amount, label = "Platform Treasury", address } = await request.json();

  if (!asset) {
    return NextResponse.json({ error: "asset is required" }, { status: 400 });
  }

  // Upsert the wallet
  const wallet = await prisma.adminWallet.upsert({
    where: { label_asset: { label, asset } },
    create: {
      label,
      asset,
      balance: amount || "0",
      address: address || null,
    },
    update: {
      ...(amount ? { balance: addBigInt((await prisma.adminWallet.findFirst({ where: { label, asset } }))?.balance || "0", amount) } : {}),
      ...(address ? { address } : {}),
    },
  });

  if (amount && BigInt(amount) > BigInt(0)) {
    await prisma.adminTransaction.create({
      data: {
        walletLabel: label,
        asset,
        amount,
        type: "CREDIT",
        description: "Manual admin wallet credit",
      },
    });
  }

  return NextResponse.json({ wallet });
}

/**
 * PATCH /api/admin/wallet — debit admin wallet (for payouts, etc.)
 * Body: { asset, amount, label?, description?, reference? }
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { asset, amount, label = "Platform Treasury", description, reference } = await request.json();

  if (!asset || !amount) {
    return NextResponse.json({ error: "asset and amount are required" }, { status: 400 });
  }

  const wallet = await prisma.adminWallet.findFirst({ where: { label, asset } });
  if (!wallet) {
    return NextResponse.json({ error: "Admin wallet not found for this asset" }, { status: 404 });
  }

  if (BigInt(wallet.balance) < BigInt(amount)) {
    return NextResponse.json({ error: "Insufficient admin wallet balance" }, { status: 400 });
  }

  const updated = await prisma.adminWallet.update({
    where: { id: wallet.id },
    data: { balance: subBigInt(wallet.balance, amount) },
  });

  await prisma.adminTransaction.create({
    data: {
      walletLabel: label,
      asset,
      amount,
      type: "DEBIT",
      description: description || "Admin withdrawal",
      reference: reference || null,
    },
  });

  return NextResponse.json({ wallet: updated });
}

/* ─── Helpers ─── */
function addBigInt(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}
function subBigInt(a: string, b: string): string {
  return (BigInt(a) - BigInt(b)).toString();
}
