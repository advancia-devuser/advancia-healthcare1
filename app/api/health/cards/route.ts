/**
 * Health Cards API
 * ────────────────
 * POST   /api/health/cards  → Add new health card (encrypt before saving)
 * GET    /api/health/cards  → List user health cards (decrypted)
 * PATCH  /api/health/cards  → Update / deactivate card
 * DELETE /api/health/cards  → Delete card
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApprovedUser } from "@/lib/auth";
import { encryptJSON, decryptJSON } from "@/lib/crypto";

const VALID_CARD_TYPES = ["INSURANCE", "VACCINATION", "PRESCRIPTION"] as const;
const VALID_CARD_STATUSES = ["ACTIVE", "EXPIRED", "INACTIVE"] as const;

type CardType = (typeof VALID_CARD_TYPES)[number];
type CardStatus = (typeof VALID_CARD_STATUSES)[number];

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function normalizeCardType(value: unknown): CardType | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return VALID_CARD_TYPES.includes(normalized as CardType) ? (normalized as CardType) : null;
}

function normalizeCardStatus(value: unknown): CardStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return VALID_CARD_STATUSES.includes(normalized as CardStatus)
    ? (normalized as CardStatus)
    : null;
}

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

function parseCardData(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/* ─── GET — List user health cards ─── */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // ACTIVE, EXPIRED, INACTIVE
    const cardType = searchParams.get("cardType"); // INSURANCE, VACCINATION, PRESCRIPTION

    const normalizedStatus = status ? normalizeCardStatus(status) : null;
    const normalizedCardType = cardType ? normalizeCardType(cardType) : null;

    if (status && !normalizedStatus) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_CARD_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    if (cardType && !normalizedCardType) {
      return NextResponse.json(
        { error: `Invalid cardType. Must be one of: ${VALID_CARD_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { userId: user.id };
    if (normalizedStatus) where.status = normalizedStatus;
    if (normalizedCardType) where.cardType = normalizedCardType;

    const cards = await prisma.healthCard.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Decrypt card data for response
    const decryptedCards = cards.map((card) => {
      let cardData: Record<string, unknown> = {};
      try {
        cardData = decryptJSON(card.encryptedData);
      } catch {
        cardData = { error: "Failed to decrypt card data" };
      }
      return {
        id: card.id,
        providerName: card.providerName,
        cardType: card.cardType,
        status: card.status,
        expiresAt: card.expiresAt,
        cardData,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
      };
    });

    // Log access for HIPAA compliance
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "HEALTH_CARDS_ACCESSED",
        meta: JSON.stringify({ count: cards.length }),
      },
    });

    return NextResponse.json({ cards: decryptedCards });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health cards GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── POST — Add new health card ─── */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { providerName, cardType, cardData, expiresAt } = body as {
      providerName?: unknown;
      cardType?: unknown;
      cardData?: unknown;
      expiresAt?: unknown;
    };

    const normalizedProviderName = normalizeNonEmptyString(providerName);
    const normalizedCardType = normalizeCardType(cardType);
    const parsedCardData = parseCardData(cardData);
    const parsedExpiresAt = parseOptionalDate(expiresAt);

    if (!normalizedProviderName || !normalizedCardType || !parsedCardData) {
      return NextResponse.json(
        { error: "providerName, cardType, and cardData are required" },
        { status: 400 }
      );
    }

    if (parsedExpiresAt === undefined) {
      return NextResponse.json(
        { error: "expiresAt must be a valid date when provided" },
        { status: 400 }
      );
    }

    // Encrypt the card data (JSON object with policy number, member ID, etc.)
    const encryptedData = encryptJSON(parsedCardData);

    const card = await prisma.healthCard.create({
      data: {
        userId: user.id,
        providerName: normalizedProviderName,
        cardType: normalizedCardType,
        encryptedData,
        expiresAt: parsedExpiresAt,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "HEALTH_CARD_ADDED",
        meta: JSON.stringify({
          cardId: card.id,
          providerName: normalizedProviderName,
          cardType: normalizedCardType,
        }),
      },
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Health Card Added",
        body: `Your ${normalizedCardType.toLowerCase()} card from ${normalizedProviderName} has been securely stored.`,
        channel: "IN_APP",
      },
    });

    return NextResponse.json(
      {
        card: {
          id: card.id,
          providerName: card.providerName,
          cardType: card.cardType,
          status: card.status,
          expiresAt: card.expiresAt,
          createdAt: card.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health cards POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── PATCH — Update / deactivate card ─── */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { cardId, providerName, cardData, status, expiresAt } = body as {
      cardId?: unknown;
      providerName?: unknown;
      cardData?: unknown;
      status?: unknown;
      expiresAt?: unknown;
    };

    const normalizedCardId = normalizeNonEmptyString(cardId);

    if (!normalizedCardId) {
      return NextResponse.json(
        { error: "cardId is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await prisma.healthCard.findFirst({
      where: { id: normalizedCardId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Health card not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (providerName !== undefined) {
      const normalizedProviderName = normalizeNonEmptyString(providerName);
      if (!normalizedProviderName) {
        return NextResponse.json(
          { error: "providerName must be a non-empty string when provided" },
          { status: 400 }
        );
      }
      updateData.providerName = normalizedProviderName;
    }

    if (status !== undefined) {
      const normalizedStatus = normalizeCardStatus(status);
      if (!normalizedStatus) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_CARD_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = normalizedStatus;
    }

    if (expiresAt !== undefined) {
      const parsedExpiresAt = parseOptionalDate(expiresAt);
      if (parsedExpiresAt === undefined) {
        return NextResponse.json(
          { error: "expiresAt must be a valid date when provided" },
          { status: 400 }
        );
      }
      updateData.expiresAt = parsedExpiresAt;
    }

    if (cardData !== undefined) {
      const parsedCardData = parseCardData(cardData);
      if (!parsedCardData) {
        return NextResponse.json(
          { error: "cardData must be a valid JSON object when provided" },
          { status: 400 }
        );
      }
      updateData.encryptedData = encryptJSON(parsedCardData);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.healthCard.update({
      where: { id: normalizedCardId },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "HEALTH_CARD_UPDATED",
        meta: JSON.stringify({
          cardId: normalizedCardId,
          changes: Object.keys(updateData),
        }),
      },
    });

    return NextResponse.json({
      card: {
        id: updated.id,
        providerName: updated.providerName,
        cardType: updated.cardType,
        status: updated.status,
        expiresAt: updated.expiresAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health cards PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── DELETE — Remove health card ─── */
export async function DELETE(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get("cardId");

    if (!cardId) {
      return NextResponse.json(
        { error: "cardId is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await prisma.healthCard.findFirst({
      where: { id: cardId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Health card not found" },
        { status: 404 }
      );
    }

    await prisma.healthCard.delete({ where: { id: cardId } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "HEALTH_CARD_DELETED",
        meta: JSON.stringify({
          cardId,
          providerName: existing.providerName,
          cardType: existing.cardType,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health cards DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
