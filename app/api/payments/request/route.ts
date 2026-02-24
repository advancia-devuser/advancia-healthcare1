import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/payments/request?page=1&limit=20&status=PENDING
 * List the authenticated user's outgoing payment requests.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));
    const status = searchParams.get("status") || undefined;

    const where: any = { userId: user.id };
    if (status) where.status = status;

    const [requests, total] = await Promise.all([
      prisma.paymentRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.paymentRequest.count({ where }),
    ]);

    return NextResponse.json({ requests, total, page, limit });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/payments/request
 * Body: { amount?: string, asset?: string, note?: string, expiresIn?: number (hours) }
 * Create a new payment request with an encoded QR payload.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();

    const { amount, asset = "ETH", note = "", expiresIn } = body;

    const wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });

    if (!wallet) {
      return NextResponse.json({ error: "No wallet found" }, { status: 404 });
    }

    const requestId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const paymentData = {
      type: "smartwallet-pay",
      version: "1.0",
      recipient: user.address,
      smartAccount: wallet.smartAccountAddress,
      amount: amount || null,
      asset,
      note,
      chainId: wallet.chainId,
      timestamp: Date.now(),
      requestId,
    };

    const qrData = JSON.stringify(paymentData);

    const expiresAt =
      expiresIn && typeof expiresIn === "number"
        ? new Date(Date.now() + expiresIn * 60 * 60 * 1000)
        : null;

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        userId: user.id,
        requestId,
        amount: amount || null,
        asset,
        note: note || null,
        qrData,
        chainId: wallet.chainId,
        status: "PENDING",
        expiresAt,
      },
    });

    return NextResponse.json({
      paymentRequest,
      qrData,
      paymentData,
    });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/payments/request
 * Body: { requestId: string, action: "CANCEL" }
 * Cancel a pending payment request.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();

    const { requestId, action } = body;

    if (!requestId || action !== "CANCEL") {
      return NextResponse.json(
        { error: "requestId and action='CANCEL' are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.paymentRequest.findFirst({
      where: { requestId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }

    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: `Cannot cancel a request with status ${existing.status}` },
        { status: 400 }
      );
    }

    const updated = await prisma.paymentRequest.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ paymentRequest: updated });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
