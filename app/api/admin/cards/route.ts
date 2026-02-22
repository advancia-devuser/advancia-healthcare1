import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/cards?status=PENDING
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;

    const where: any = {};
    if (status) where.status = status;

    const cards = await prisma.cardRequest.findMany({
      where,
      include: { user: { select: { address: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ cards });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch cards" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/cards
 * Body: { cardId: string, action: "APPROVE" | "REJECT", last4?: string }
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { cardId, action, last4 } = await request.json();
    if (!cardId || !action) {
      return NextResponse.json(
        { error: "cardId and action are required" },
        { status: 400 }
      );
    }

    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

    const card = await prisma.cardRequest.update({
      where: { id: cardId },
      data: {
        status: newStatus as any,
        last4: action === "APPROVE" ? last4 || null : undefined,
        decidedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: card.userId,
        actor: "ADMIN",
        action: `CARD_${action}`,
        meta: JSON.stringify({ cardId, last4 }),
      },
    });

    return NextResponse.json({ card });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 });
  }
}
