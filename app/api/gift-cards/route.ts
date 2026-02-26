import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";
import { GiftCardStatus } from "@prisma/client";

const GIFT_CARD_STATUSES = new Set<GiftCardStatus>([
  GiftCardStatus.ACTIVE,
  GiftCardStatus.REDEEMED,
  GiftCardStatus.EXPIRED,
]);

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeBigIntString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  return raw;
}

function normalizeCurrency(value: unknown): string {
  if (typeof value !== "string") {
    return "USD";
  }

  const normalized = value.trim().toUpperCase();
  return normalized || "USD";
}

function parseChainId(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function normalizeGiftCardStatus(value: string | null): GiftCardStatus | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return GIFT_CARD_STATUSES.has(normalized as GiftCardStatus) ? (normalized as GiftCardStatus) : null;
}

/**
 * GET /api/gift-cards?status=ACTIVE
 * Returns user's gift cards.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const status = normalizeGiftCardStatus(searchParams.get("status"));

    if (searchParams.get("status") && !status) {
      return NextResponse.json({ error: "status must be ACTIVE, REDEEMED, or EXPIRED" }, { status: 400 });
    }

    const where: { userId: string; status?: GiftCardStatus } = { userId: user.id };
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
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { merchantName, initialValue, currency, expiresAt, chainId } = body as {
      merchantName?: unknown;
      initialValue?: unknown;
      currency?: unknown;
      expiresAt?: unknown;
      chainId?: unknown;
    };

    const normalizedMerchantName = normalizeNonEmptyString(merchantName);
    const normalizedInitialValue = normalizeBigIntString(initialValue);
    const normalizedCurrency = normalizeCurrency(currency);
    const normalizedExpiresAt = parseOptionalDate(expiresAt);
    const normalizedChainId = parseChainId(chainId, 421614);

    if (!normalizedMerchantName || !normalizedInitialValue) {
      return NextResponse.json(
        { error: "merchantName and initialValue are required" },
        { status: 400 }
      );
    }

    if (normalizedInitialValue === "0") {
      return NextResponse.json({ error: "initialValue must be greater than 0" }, { status: 400 });
    }

    if (expiresAt !== undefined && expiresAt !== null && !normalizedExpiresAt) {
      return NextResponse.json({ error: "expiresAt must be a valid date" }, { status: 400 });
    }

    if (!normalizedChainId) {
      return NextResponse.json({ error: "chainId must be a positive integer" }, { status: 400 });
    }

    // Debit wallet for gift card purchase
    await debitWallet({
      userId: user.id,
      asset: "ETH",
      amount: normalizedInitialValue,
      chainId: normalizedChainId,
      type: "SEND",
      status: "CONFIRMED",
      meta: { type: "GIFT_CARD_PURCHASE", merchantName: normalizedMerchantName },
    });

    const code = `GC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const card = await prisma.giftCard.create({
      data: {
        userId: user.id,
        merchantName: normalizedMerchantName,
        code,
        initialValue: normalizedInitialValue,
        currentValue: normalizedInitialValue,
        currency: normalizedCurrency,
        expiresAt: normalizedExpiresAt,
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Gift Card Purchased",
        body: `${normalizedMerchantName} gift card worth ${normalizedInitialValue} ${normalizedCurrency} purchased`,
        channel: "IN_APP",
        meta: JSON.stringify({ giftCardId: card.id }),
      },
    });

    return NextResponse.json({ card }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.message.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
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
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { cardId, redeemAmount } = body as { cardId?: unknown; redeemAmount?: unknown };
    const normalizedCardId = normalizeNonEmptyString(cardId);
    const normalizedRedeemAmount = normalizeBigIntString(redeemAmount);

    if (!normalizedCardId || !normalizedRedeemAmount) {
      return NextResponse.json(
        { error: "cardId and redeemAmount are required" },
        { status: 400 }
      );
    }

    if (normalizedRedeemAmount === "0") {
      return NextResponse.json({ error: "redeemAmount must be greater than 0" }, { status: 400 });
    }

    const card = await prisma.giftCard.findFirst({
      where: { id: normalizedCardId, userId: user.id, status: "ACTIVE" },
    });

    if (!card) {
      return NextResponse.json({ error: "Gift card not found or inactive" }, { status: 404 });
    }

    const currentVal = BigInt(card.currentValue);
  const redeemVal = BigInt(normalizedRedeemAmount);

    if (redeemVal > currentVal) {
      return NextResponse.json({ error: "Redeem amount exceeds card value" }, { status: 400 });
    }

    const newValue = (currentVal - redeemVal).toString();
    const newStatus = newValue === "0" ? GiftCardStatus.REDEEMED : GiftCardStatus.ACTIVE;

    const updated = await prisma.giftCard.update({
      where: { id: normalizedCardId },
      data: {
        currentValue: newValue,
        status: newStatus,
      },
    });

    return NextResponse.json({ card: updated });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
