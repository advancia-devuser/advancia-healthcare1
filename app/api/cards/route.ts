import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type CardType = "VIRTUAL" | "PHYSICAL";
type CardAction = "FREEZE" | "UNFREEZE" | "CANCEL";

const CARD_TYPES = new Set<CardType>(["VIRTUAL", "PHYSICAL"]);
const CARD_ACTIONS = new Set<CardAction>(["FREEZE", "UNFREEZE", "CANCEL"]);
const VALID_CURRENCIES = new Set(["USD", "EUR", "GBP"]);

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCardType(value: unknown): CardType | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return CARD_TYPES.has(normalized as CardType) ? (normalized as CardType) : null;
}

function normalizeCardAction(value: unknown): CardAction | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return CARD_ACTIONS.has(normalized as CardAction) ? (normalized as CardAction) : null;
}

function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return VALID_CURRENCIES.has(normalized) ? normalized : null;
}

function normalizeAmount(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  return raw;
}

/**
 * GET /api/cards — list current user's card requests
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const cards = await prisma.cardRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ cards });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/cards — Request a virtual or physical card
 * Body: {
 *   cardType?: "VIRTUAL" | "PHYSICAL",
 *   design?: string,
 *   currency?: string,
 *   spendingLimit?: string,
 *   // Physical card delivery fields:
 *   deliveryName?: string,
 *   deliveryAddress?: string,
 *   deliveryCity?: string,
 *   deliveryState?: string,
 *   deliveryZip?: string,
 *   deliveryCountry?: string,
 *   deliveryPhone?: string,
 * }
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      cardType,
      design = "DEFAULT",
      currency,
      spendingLimit,
      deliveryName,
      deliveryAddress,
      deliveryCity,
      deliveryState,
      deliveryZip,
      deliveryCountry,
      deliveryPhone,
    } = body as {
      cardType?: unknown;
      design?: unknown;
      currency?: unknown;
      spendingLimit?: unknown;
      deliveryName?: unknown;
      deliveryAddress?: unknown;
      deliveryCity?: unknown;
      deliveryState?: unknown;
      deliveryZip?: unknown;
      deliveryCountry?: unknown;
      deliveryPhone?: unknown;
    };

    const normalizedCardType = normalizeCardType(cardType ?? "VIRTUAL");
    const normalizedDesign = normalizeNonEmptyString(design) || "DEFAULT";
    const normalizedCurrency = normalizeCurrency(currency ?? "USD");
    const normalizedSpendingLimit = normalizeAmount(spendingLimit);
    const normalizedDeliveryName = normalizeNonEmptyString(deliveryName);
    const normalizedDeliveryAddress = normalizeNonEmptyString(deliveryAddress);
    const normalizedDeliveryCity = normalizeNonEmptyString(deliveryCity);
    const normalizedDeliveryState = normalizeNonEmptyString(deliveryState);
    const normalizedDeliveryZip = normalizeNonEmptyString(deliveryZip);
    const normalizedDeliveryCountry = normalizeNonEmptyString(deliveryCountry) || "US";
    const normalizedDeliveryPhone = normalizeNonEmptyString(deliveryPhone);

    // Validate card type
    if (!normalizedCardType) {
      return NextResponse.json({ error: "cardType must be VIRTUAL or PHYSICAL" }, { status: 400 });
    }

    // Physical cards require delivery address
    if (normalizedCardType === "PHYSICAL") {
      if (
        !normalizedDeliveryName ||
        !normalizedDeliveryAddress ||
        !normalizedDeliveryCity ||
        !normalizedDeliveryState ||
        !normalizedDeliveryZip
      ) {
        return NextResponse.json(
          { error: "Physical cards require delivery name, address, city, state, and zip code" },
          { status: 400 }
        );
      }
    }

    // Validate currency
    if (!normalizedCurrency) {
      return NextResponse.json({ error: "Currency must be USD, EUR, or GBP" }, { status: 400 });
    }

    if (spendingLimit !== undefined && spendingLimit !== null && normalizedSpendingLimit === null) {
      return NextResponse.json({ error: "spendingLimit must be a non-negative integer string" }, { status: 400 });
    }

    // Check if user already has a pending request of this type
    const existing = await prisma.cardRequest.findFirst({
      where: { userId: user.id, status: "PENDING", cardType: normalizedCardType },
    });
    if (existing) {
      return NextResponse.json(
        { error: `You already have a pending ${normalizedCardType.toLowerCase()} card request` },
        { status: 409 }
      );
    }

    const card = await prisma.cardRequest.create({
      data: {
        userId: user.id,
        cardType: normalizedCardType,
        design: normalizedDesign,
        currency: normalizedCurrency,
        spendingLimit: normalizedSpendingLimit,
        ...(normalizedCardType === "PHYSICAL" ? {
          deliveryName: normalizedDeliveryName,
          deliveryAddress: normalizedDeliveryAddress,
          deliveryCity: normalizedDeliveryCity,
          deliveryState: normalizedDeliveryState,
          deliveryZip: normalizedDeliveryZip,
          deliveryCountry: normalizedDeliveryCountry,
          deliveryPhone: normalizedDeliveryPhone,
        } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: `CARD_REQUESTED_${normalizedCardType}`,
        meta: JSON.stringify({ cardType: normalizedCardType, design: normalizedDesign, currency: normalizedCurrency }),
      },
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: `${normalizedCardType === "PHYSICAL" ? "Physical" : "Virtual"} Card Requested`,
        body: normalizedCardType === "PHYSICAL"
          ? `Your physical ${normalizedDesign} card will be shipped to ${normalizedDeliveryCity}, ${normalizedDeliveryState}. Allow 5-7 business days for delivery.`
          : `Your virtual ${normalizedDesign} card request is being processed. You'll be notified once it's activated.`,
      },
    });

    return NextResponse.json({ card }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/cards — Freeze/unfreeze a card
 * Body: { cardId: string, action: "FREEZE" | "UNFREEZE" | "CANCEL" }
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { cardId, action } = body as { cardId?: unknown; action?: unknown };
    const normalizedCardId = normalizeNonEmptyString(cardId);
    const normalizedAction = normalizeCardAction(action);

    if (!normalizedCardId || !normalizedAction) {
      return NextResponse.json({ error: "cardId and action (FREEZE/UNFREEZE/CANCEL) required" }, { status: 400 });
    }

    const card = await prisma.cardRequest.findFirst({
      where: { id: normalizedCardId, userId: user.id },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    if (normalizedAction === "FREEZE") {
      const updated = await prisma.cardRequest.update({
        where: { id: normalizedCardId },
        data: { frozenAt: new Date() },
      });
      return NextResponse.json({ card: updated });
    }

    if (normalizedAction === "UNFREEZE") {
      const updated = await prisma.cardRequest.update({
        where: { id: normalizedCardId },
        data: { frozenAt: null },
      });
      return NextResponse.json({ card: updated });
    }

    if (normalizedAction === "CANCEL") {
      if (card.status !== "PENDING") {
        return NextResponse.json({ error: "Only pending cards can be cancelled" }, { status: 400 });
      }
      const updated = await prisma.cardRequest.update({
        where: { id: normalizedCardId },
        data: { status: "REJECTED", decidedAt: new Date() },
      });
      return NextResponse.json({ card: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
