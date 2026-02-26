import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return normalizeNonEmptyString(value);
}

function normalizeNonNegativeIntegerString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  return raw;
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
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { merchantName, cardNumber, barcode, pointsBalance, expiresAt } = body as {
      merchantName?: unknown;
      cardNumber?: unknown;
      barcode?: unknown;
      pointsBalance?: unknown;
      expiresAt?: unknown;
    };

    const normalizedMerchantName = normalizeNonEmptyString(merchantName);
    const normalizedCardNumber = normalizeNonEmptyString(cardNumber);
    const normalizedBarcode = normalizeOptionalString(barcode);
    const normalizedPointsBalance = normalizeNonNegativeIntegerString(pointsBalance);
    const normalizedExpiresAt = parseOptionalDate(expiresAt);

    if (!normalizedMerchantName || !normalizedCardNumber) {
      return NextResponse.json(
        { error: "merchantName and cardNumber are required" },
        { status: 400 }
      );
    }

    if (pointsBalance !== undefined && pointsBalance !== null && normalizedPointsBalance === null) {
      return NextResponse.json({ error: "pointsBalance must be a non-negative integer string" }, { status: 400 });
    }

    if (expiresAt !== undefined && expiresAt !== null && normalizedExpiresAt === null) {
      return NextResponse.json({ error: "expiresAt must be a valid date" }, { status: 400 });
    }

    const card = await prisma.loyaltyCard.create({
      data: {
        userId: user.id,
        merchantName: normalizedMerchantName,
        cardNumber: normalizedCardNumber,
        barcode: normalizedBarcode,
        pointsBalance: normalizedPointsBalance || "0",
        expiresAt: normalizedExpiresAt,
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
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { cardId, pointsBalance, merchantName, cardNumber } = body as {
      cardId?: unknown;
      pointsBalance?: unknown;
      merchantName?: unknown;
      cardNumber?: unknown;
    };

    const normalizedCardId = normalizeNonEmptyString(cardId);
    const normalizedPointsBalance = pointsBalance !== undefined
      ? normalizeNonNegativeIntegerString(pointsBalance)
      : undefined;
    const normalizedMerchantName = merchantName !== undefined
      ? normalizeNonEmptyString(merchantName)
      : undefined;
    const normalizedCardNumber = cardNumber !== undefined
      ? normalizeNonEmptyString(cardNumber)
      : undefined;

    if (!normalizedCardId) {
      return NextResponse.json({ error: "cardId is required" }, { status: 400 });
    }

    if (pointsBalance !== undefined && normalizedPointsBalance === null) {
      return NextResponse.json({ error: "pointsBalance must be a non-negative integer string" }, { status: 400 });
    }

    if (merchantName !== undefined && normalizedMerchantName === null) {
      return NextResponse.json({ error: "merchantName cannot be empty" }, { status: 400 });
    }

    if (cardNumber !== undefined && normalizedCardNumber === null) {
      return NextResponse.json({ error: "cardNumber cannot be empty" }, { status: 400 });
    }

    const existing = await prisma.loyaltyCard.findFirst({
      where: { id: normalizedCardId, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const updateData: {
      pointsBalance?: string;
      merchantName?: string;
      cardNumber?: string;
    } = {};
    if (typeof normalizedPointsBalance === "string") updateData.pointsBalance = normalizedPointsBalance;
    if (typeof normalizedMerchantName === "string") updateData.merchantName = normalizedMerchantName;
    if (typeof normalizedCardNumber === "string") updateData.cardNumber = normalizedCardNumber;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "At least one updatable field (pointsBalance, merchantName, cardNumber) is required" },
        { status: 400 }
      );
    }

    const card = await prisma.loyaltyCard.update({
      where: { id: normalizedCardId },
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
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { cardId } = body as { cardId?: unknown };
    const normalizedCardId = normalizeNonEmptyString(cardId);

    if (!normalizedCardId) {
      return NextResponse.json({ error: "cardId is required" }, { status: 400 });
    }

    await prisma.loyaltyCard.deleteMany({
      where: { id: normalizedCardId, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
