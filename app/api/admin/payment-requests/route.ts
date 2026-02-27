import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PAYMENT_REQUEST_STATUS_VALUES = new Set([
  "PENDING",
  "PAID",
  "CANCELLED",
  "EXPIRED",
] as const);

type PaymentRequestStatus = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED";
type AdminPaymentRequestAction = "CANCEL" | "EXPIRE";

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function isPaymentRequestStatus(value: unknown): value is PaymentRequestStatus {
  return typeof value === "string" && PAYMENT_REQUEST_STATUS_VALUES.has(value as PaymentRequestStatus);
}

function isAdminPaymentRequestAction(value: unknown): value is AdminPaymentRequestAction {
  return value === "CANCEL" || value === "EXPIRE";
}

/**
 * GET /api/admin/payment-requests?status=PENDING&page=1&limit=20
 * Admin: list all payment requests with optional status filter.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status");
    const candidateStatus = rawStatus ? rawStatus.trim().toUpperCase() : undefined;
    if (candidateStatus && !isPaymentRequestStatus(candidateStatus)) {
      return NextResponse.json(
        { error: "Invalid status. Allowed values: PENDING, PAID, CANCELLED, EXPIRED" },
        { status: 400 }
      );
    }

    const status: PaymentRequestStatus | undefined =
      candidateStatus && isPaymentRequestStatus(candidateStatus) ? candidateStatus : undefined;
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInt(searchParams.get("limit"), 20));

    const where: { status?: PaymentRequestStatus } = {};
    if (status) where.status = status;

    const [requests, total, counts] = await Promise.all([
      prisma.paymentRequest.findMany({
        where,
        include: {
          user: { select: { id: true, address: true, email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.paymentRequest.count({ where }),
      prisma.paymentRequest.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const statusSummary = counts.reduce(
      (acc: Record<string, number>, row: { status: string; _count: { _all: number } }) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      requests,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      summary: statusSummary,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch payment requests" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/payment-requests
 * Body: { requestId: string, action: "CANCEL" | "EXPIRE" }
 * Admin force-cancel or force-expire a payment request.
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { requestId, action } = body as { requestId?: unknown; action?: unknown };

    if (typeof requestId !== "string" || !requestId.trim()) {
      return NextResponse.json(
        { error: "requestId is required" },
        { status: 400 }
      );
    }

    if (!isAdminPaymentRequestAction(action)) {
      return NextResponse.json(
        { error: "Invalid action. Allowed values: CANCEL, EXPIRE" },
        { status: 400 }
      );
    }

    const existing = await prisma.paymentRequest.findUnique({
      where: { requestId: requestId.trim() },
    });

    if (!existing) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }

    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: `Cannot modify a request with status ${existing.status}` },
        { status: 409 }
      );
    }

    const newStatus: PaymentRequestStatus = action === "CANCEL" ? "CANCELLED" : "EXPIRED";

    const updated = await prisma.paymentRequest.update({
      where: { id: existing.id },
      data: { status: newStatus },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor: "ADMIN",
        action: `PAYMENT_REQUEST_${newStatus}`,
        meta: JSON.stringify({ requestId: requestId.trim(), previousStatus: "PENDING" }),
      },
    });

    return NextResponse.json({ paymentRequest: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update payment request" }, { status: 500 });
  }
}
