import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

/**
 * GET /api/gift-cards?status=ACTIVE
 * Returns user's gift cards.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: any = { userId: user.id };
    if (status) where.status = status;

    const cards = await prisma.giftCard.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ cards });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/gift-cards
 * Body: { merchantName, initialValue, currency?, expiresAt? }
 * Purchase a new gift card (deducts from wallet).
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();

    const { merchantName, initialValue, currency, expiresAt, chainId } = body;

    if (!merchantName || !initialValue) {
      return NextResponse.json(
        { error: "merchantName and initialValue are required" },
        { status: 400 }
      );
    }

    // Debit wallet for gift card purchase
    await debitWallet({
      userId: user.id,
      asset: "ETH",
      amount: String(initialValue),
      chainId: chainId || 421614,
      type: "SEND",
      status: "CONFIRMED",
      meta: { type: "GIFT_CARD_PURCHASE", merchantName },
    });

    const code = `GC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const card = await prisma.giftCard.create({
      data: {
        userId: user.id,
        merchantName,
        code,
        initialValue: String(initialValue),
        currentValue: String(initialValue),
        currency: currency || "USD",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Gift Card Purchased",
        body: `${merchantName} gift card worth ${initialValue} ${currency || "USD"} purchased`,
        channel: "IN_APP",
        meta: JSON.stringify({ giftCardId: card.id }),
      },
    });

    return NextResponse.json({ card }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (err.message?.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/gift-cards
 * Body: { cardId, redeemAmount }
 * Partially redeem a gift card.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();
    const { cardId, redeemAmount } = body;

    if (!cardId || !redeemAmount) {
      return NextResponse.json(
        { error: "cardId and redeemAmount are required" },
        { status: 400 }
      );
    }

    const card = await prisma.giftCard.findFirst({
      where: { id: cardId, userId: user.id, status: "ACTIVE" },
    });

    if (!card) {
      return NextResponse.json({ error: "Gift card not found or inactive" }, { status: 404 });
    }

    const currentVal = BigInt(card.currentValue);
    const redeemVal = BigInt(redeemAmount);

    if (redeemVal > currentVal) {
      return NextResponse.json({ error: "Redeem amount exceeds card value" }, { status: 400 });
    }

    const newValue = (currentVal - redeemVal).toString();
    const newStatus = newValue === "0" ? "REDEEMED" : "ACTIVE";

    const updated = await prisma.giftCard.update({
      where: { id: cardId },
      data: {
        currentValue: newValue,
        status: newStatus as any,
      },
    });

    return NextResponse.json({ card: updated });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
