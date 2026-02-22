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

/* ─── GET — List user health cards ─── */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // ACTIVE, EXPIRED, INACTIVE
    const cardType = searchParams.get("cardType"); // INSURANCE, VACCINATION, PRESCRIPTION

    const where: Record<string, unknown> = { userId: user.id };
    if (status) where.status = status;
    if (cardType) where.cardType = cardType;

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
    const body = await request.json();

    const { providerName, cardType, cardData, expiresAt } = body;

    if (!providerName || !cardType || !cardData) {
      return NextResponse.json(
        { error: "providerName, cardType, and cardData are required" },
        { status: 400 }
      );
    }

    const validCardTypes = ["INSURANCE", "VACCINATION", "PRESCRIPTION"];
    if (!validCardTypes.includes(cardType)) {
      return NextResponse.json(
        { error: `Invalid cardType. Must be one of: ${validCardTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Encrypt the card data (JSON object with policy number, member ID, etc.)
    const encryptedData = encryptJSON(
      typeof cardData === "string" ? JSON.parse(cardData) : cardData
    );

    const card = await prisma.healthCard.create({
      data: {
        userId: user.id,
        providerName,
        cardType,
        encryptedData,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
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
          providerName,
          cardType,
        }),
      },
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Health Card Added",
        body: `Your ${cardType.toLowerCase()} card from ${providerName} has been securely stored.`,
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
    const body = await request.json();

    const { cardId, providerName, cardData, status, expiresAt } = body;

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

    const updateData: Record<string, unknown> = {};
    if (providerName) updateData.providerName = providerName;
    if (status) {
      const validStatuses = ["ACTIVE", "EXPIRED", "INACTIVE"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }
    if (expiresAt) updateData.expiresAt = new Date(expiresAt);
    if (cardData) {
      updateData.encryptedData = encryptJSON(
        typeof cardData === "string" ? JSON.parse(cardData) : cardData
      );
    }

    const updated = await prisma.healthCard.update({
      where: { id: cardId },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "HEALTH_CARD_UPDATED",
        meta: JSON.stringify({
          cardId,
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
