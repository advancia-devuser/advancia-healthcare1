import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PAYMENT_REQUEST_STATUS_VALUES = new Set([
  "PENDING",
  "PAID",
  "CANCELLED",
  "EXPIRED",
] as const);

type PaymentRequestStatus = "PENDING" | "PAID" | "CANCELLED" | "EXPIRED";

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOptionalPositiveIntString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  try {
    return BigInt(trimmed) > BigInt(0) ? BigInt(trimmed).toString() : null;
  } catch {
    return null;
  }
}

function isPaymentRequestStatus(value: unknown): value is PaymentRequestStatus {
  return typeof value === "string" && PAYMENT_REQUEST_STATUS_VALUES.has(value as PaymentRequestStatus);
}

/**
 * GET /api/payments/request?page=1&limit=20&status=PENDING
 * List the authenticated user's outgoing payment requests.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);

    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInt(searchParams.get("limit"), 20));
    const rawStatus = searchParams.get("status");
    const normalizedStatus = rawStatus ? rawStatus.trim().toUpperCase() : undefined;

    if (normalizedStatus && !isPaymentRequestStatus(normalizedStatus)) {
      return NextResponse.json(
        { error: "Invalid status. Allowed values: PENDING, PAID, CANCELLED, EXPIRED" },
        { status: 400 }
      );
    }

    const status: PaymentRequestStatus | undefined =
      normalizedStatus && isPaymentRequestStatus(normalizedStatus) ? normalizedStatus : undefined;

    const where: { userId: string; status?: PaymentRequestStatus } = { userId: user.id };
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
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { amount, asset, note, expiresIn } = body as {
      amount?: unknown;
      asset?: unknown;
      note?: unknown;
      expiresIn?: unknown;
    };

    const normalizedAmount = parseOptionalPositiveIntString(amount);
    if (amount !== undefined && amount !== null && amount !== "" && !normalizedAmount) {
      return NextResponse.json(
        { error: "amount must be a positive integer string when provided" },
        { status: 400 }
      );
    }

    const normalizedAsset = normalizeNonEmptyString(asset) || "ETH";

    const normalizedNote = note === undefined || note === null ? "" : normalizeNonEmptyString(note);
    if (note !== undefined && note !== null && normalizedNote === null) {
      return NextResponse.json({ error: "note must be a non-empty string" }, { status: 400 });
    }

    const normalizedExpiresIn =
      expiresIn === undefined || expiresIn === null || expiresIn === ""
        ? null
        : typeof expiresIn === "number"
          ? Math.trunc(expiresIn)
          : Number.parseInt(String(expiresIn), 10);

    if (normalizedExpiresIn !== null && (!Number.isFinite(normalizedExpiresIn) || normalizedExpiresIn <= 0)) {
      return NextResponse.json({ error: "expiresIn must be a positive integer (hours)" }, { status: 400 });
    }

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
      amount: normalizedAmount,
      asset: normalizedAsset,
      note: normalizedNote || "",
      chainId: wallet.chainId,
      timestamp: Date.now(),
      requestId,
    };

    const qrData = JSON.stringify(paymentData);

    const expiresAt =
      normalizedExpiresIn
        ? new Date(Date.now() + normalizedExpiresIn * 60 * 60 * 1000)
        : null;

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        userId: user.id,
        requestId,
        amount: normalizedAmount,
        asset: normalizedAsset,
        note: normalizedNote || null,
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
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { requestId, action } = body as { requestId?: unknown; action?: unknown };

    const normalizedRequestId = normalizeNonEmptyString(requestId);
    const normalizedAction = typeof action === "string" ? action.trim().toUpperCase() : action;

    if (!normalizedRequestId || normalizedAction !== "CANCEL") {
      return NextResponse.json(
        { error: "requestId and action='CANCEL' are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.paymentRequest.findFirst({
      where: { requestId: normalizedRequestId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }

    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { error: `Cannot cancel a request with status ${existing.status}` },
        { status: 409 }
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
