import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma, RequestStatus } from "@prisma/client";

const REQUEST_STATUS_VALUES = new Set<RequestStatus>([
  RequestStatus.PENDING,
  RequestStatus.APPROVED,
  RequestStatus.REJECTED,
]);

type AdminCardAction = "APPROVE" | "REJECT";
const ADMIN_CARD_ACTION_VALUES = new Set<AdminCardAction>(["APPROVE", "REJECT"]);

function isAdminCardAction(value: unknown): value is AdminCardAction {
  return typeof value === "string" && ADMIN_CARD_ACTION_VALUES.has(value as AdminCardAction);
}

function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && REQUEST_STATUS_VALUES.has(value as RequestStatus);
}

/**
 * GET /api/admin/cards?status=PENDING
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status");
    const candidateStatus = rawStatus ? rawStatus.trim().toUpperCase() : undefined;

    if (candidateStatus && !isRequestStatus(candidateStatus)) {
      return NextResponse.json(
        { error: "Invalid status. Allowed values: PENDING, APPROVED, REJECTED" },
        { status: 400 }
      );
    }

    const status: RequestStatus | undefined = candidateStatus;

    const where: { status?: RequestStatus } = {};
    if (status) where.status = status;

    const cards = await prisma.cardRequest.findMany({
      where,
      include: { user: { select: { address: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ cards });
  } catch {
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
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { cardId, action, last4 } = body as {
      cardId?: unknown;
      action?: unknown;
      last4?: unknown;
    };

    if (typeof cardId !== "string" || !cardId.trim()) {
      return NextResponse.json({ error: "cardId is required" }, { status: 400 });
    }

    if (!isAdminCardAction(action)) {
      return NextResponse.json(
        { error: "Invalid action. Allowed values: APPROVE, REJECT" },
        { status: 400 }
      );
    }

    if (last4 !== undefined && last4 !== null && (typeof last4 !== "string" || !/^\d{4}$/.test(last4))) {
      return NextResponse.json(
        { error: "last4 must be a 4-digit string when provided" },
        { status: 400 }
      );
    }

    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

    const card = await prisma.cardRequest.update({
      where: { id: cardId.trim() },
      data: {
        status: newStatus,
        last4: action === "APPROVE" ? last4 || null : undefined,
        decidedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: card.userId,
        actor: "ADMIN",
        action: `CARD_${action}`,
        meta: JSON.stringify({ cardId: card.id, action, ...(action === "APPROVE" ? { last4: last4 || null } : {}) }),
      },
    });

    return NextResponse.json({ card });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Card request not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 });
  }
}
