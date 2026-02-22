import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/loyalty-cards
 * Returns user's stored loyalty cards.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const cards = await prisma.loyaltyCard.findMany({
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
 * POST /api/loyalty-cards
 * Body: { merchantName, cardNumber, barcode?, pointsBalance?, expiresAt? }
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();

    const { merchantName, cardNumber, barcode, pointsBalance, expiresAt } = body;

    if (!merchantName || !cardNumber) {
      return NextResponse.json(
        { error: "merchantName and cardNumber are required" },
        { status: 400 }
      );
    }

    const card = await prisma.loyaltyCard.create({
      data: {
        userId: user.id,
        merchantName,
        cardNumber,
        barcode: barcode || null,
        pointsBalance: pointsBalance || "0",
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return NextResponse.json({ card }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/loyalty-cards
 * Body: { cardId, pointsBalance?, merchantName?, cardNumber? }
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();
    const { cardId, pointsBalance, merchantName, cardNumber } = body;

    if (!cardId) {
      return NextResponse.json({ error: "cardId is required" }, { status: 400 });
    }

    const existing = await prisma.loyaltyCard.findFirst({
      where: { id: cardId, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (pointsBalance !== undefined) updateData.pointsBalance = String(pointsBalance);
    if (merchantName !== undefined) updateData.merchantName = merchantName;
    if (cardNumber !== undefined) updateData.cardNumber = cardNumber;

    const card = await prisma.loyaltyCard.update({
      where: { id: cardId },
      data: updateData,
    });

    return NextResponse.json({ card });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/loyalty-cards
 * Body: { cardId }
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { cardId } = await request.json();

    if (!cardId) {
      return NextResponse.json({ error: "cardId is required" }, { status: 400 });
    }

    await prisma.loyaltyCard.deleteMany({
      where: { id: cardId, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
