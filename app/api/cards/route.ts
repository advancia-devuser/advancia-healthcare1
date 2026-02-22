import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    const body = await request.json().catch(() => ({}));

    const {
      cardType = "VIRTUAL",
      design = "DEFAULT",
      currency = "USD",
      spendingLimit,
      deliveryName,
      deliveryAddress,
      deliveryCity,
      deliveryState,
      deliveryZip,
      deliveryCountry = "US",
      deliveryPhone,
    } = body;

    // Validate card type
    if (!["VIRTUAL", "PHYSICAL"].includes(cardType)) {
      return NextResponse.json({ error: "cardType must be VIRTUAL or PHYSICAL" }, { status: 400 });
    }

    // Physical cards require delivery address
    if (cardType === "PHYSICAL") {
      if (!deliveryName || !deliveryAddress || !deliveryCity || !deliveryState || !deliveryZip) {
        return NextResponse.json(
          { error: "Physical cards require delivery name, address, city, state, and zip code" },
          { status: 400 }
        );
      }
    }

    // Validate currency
    const validCurrencies = ["USD", "EUR", "GBP"];
    if (!validCurrencies.includes(currency)) {
      return NextResponse.json({ error: "Currency must be USD, EUR, or GBP" }, { status: 400 });
    }

    // Check if user already has a pending request of this type
    const existing = await prisma.cardRequest.findFirst({
      where: { userId: user.id, status: "PENDING", cardType },
    });
    if (existing) {
      return NextResponse.json(
        { error: `You already have a pending ${cardType.toLowerCase()} card request` },
        { status: 409 }
      );
    }

    const card = await prisma.cardRequest.create({
      data: {
        userId: user.id,
        cardType,
        design,
        currency,
        spendingLimit: spendingLimit || null,
        ...(cardType === "PHYSICAL" ? {
          deliveryName,
          deliveryAddress,
          deliveryCity,
          deliveryState,
          deliveryZip,
          deliveryCountry,
          deliveryPhone: deliveryPhone || null,
        } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: `CARD_REQUESTED_${cardType}`,
        meta: JSON.stringify({ cardType, design, currency }),
      },
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: `${cardType === "PHYSICAL" ? "Physical" : "Virtual"} Card Requested`,
        body: cardType === "PHYSICAL"
          ? `Your physical ${design} card will be shipped to ${deliveryCity}, ${deliveryState}. Allow 5-7 business days for delivery.`
          : `Your virtual ${design} card request is being processed. You'll be notified once it's activated.`,
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
    const { cardId, action } = await request.json();

    if (!cardId || !["FREEZE", "UNFREEZE", "CANCEL"].includes(action)) {
      return NextResponse.json({ error: "cardId and action (FREEZE/UNFREEZE/CANCEL) required" }, { status: 400 });
    }

    const card = await prisma.cardRequest.findFirst({
      where: { id: cardId, userId: user.id },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    if (action === "FREEZE") {
      const updated = await prisma.cardRequest.update({
        where: { id: cardId },
        data: { frozenAt: new Date() },
      });
      return NextResponse.json({ card: updated });
    }

    if (action === "UNFREEZE") {
      const updated = await prisma.cardRequest.update({
        where: { id: cardId },
        data: { frozenAt: null },
      });
      return NextResponse.json({ card: updated });
    }

    if (action === "CANCEL") {
      if (card.status !== "PENDING") {
        return NextResponse.json({ error: "Only pending cards can be cancelled" }, { status: 400 });
      }
      const updated = await prisma.cardRequest.update({
        where: { id: cardId },
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
