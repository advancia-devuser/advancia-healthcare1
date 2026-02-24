import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/payment-requests?status=PENDING&page=1&limit=20
 * Admin: list all payment requests with optional status filter.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

  try {
    const where: any = {};
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
      (acc: Record<string, number>, row: any) => {
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
  } catch (err: any) {
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
    const { requestId, action } = await request.json();

    if (!requestId || !["CANCEL", "EXPIRE"].includes(action)) {
      return NextResponse.json(
        { error: "requestId and action ('CANCEL' | 'EXPIRE') are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.paymentRequest.findUnique({
      where: { requestId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }

    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: `Cannot modify a request with status ${existing.status}` },
        { status: 400 }
      );
    }

    const newStatus = action === "CANCEL" ? "CANCELLED" : "EXPIRED";

    const updated = await prisma.paymentRequest.update({
      where: { id: existing.id },
      data: { status: newStatus },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor: "ADMIN",
        action: `PAYMENT_REQUEST_${newStatus}`,
        meta: JSON.stringify({ requestId, previousStatus: "PENDING" }),
      },
    });

    return NextResponse.json({ paymentRequest: updated });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update payment request" }, { status: 500 });
  }
}
