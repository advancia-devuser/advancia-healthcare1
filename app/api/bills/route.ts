import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";
import { BillPaymentStatus } from "@prisma/client";

const BILL_PAYMENT_STATUSES = new Set<BillPaymentStatus>([
  BillPaymentStatus.PENDING,
  BillPaymentStatus.PAID,
  BillPaymentStatus.FAILED,
  BillPaymentStatus.SCHEDULED,
]);

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseChainId(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function normalizeStatus(value: string | null): BillPaymentStatus | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return BILL_PAYMENT_STATUSES.has(normalized as BillPaymentStatus)
    ? (normalized as BillPaymentStatus)
    : null;
}

function normalizePositiveAmount(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  if (BigInt(raw) <= BigInt(0)) {
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
 * GET /api/bills?page=1&limit=20&status=PENDING
 * Returns user's bill payment history.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInteger(searchParams.get("limit"), 20));
    const rawStatus = searchParams.get("status");
    const status = normalizeStatus(rawStatus);

    if (rawStatus && !status) {
      return NextResponse.json({ error: "status must be PENDING, PAID, FAILED, or SCHEDULED" }, { status: 400 });
    }

    const where: { userId: string; status?: BillPaymentStatus } = { userId: user.id };
    if (status) where.status = status;

    const [bills, total] = await Promise.all([
      prisma.billPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.billPayment.count({ where }),
    ]);

    return NextResponse.json({ bills, total, page, limit });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/bills
 * Body: { billerName, billerCode?, accountNumber, amount, asset?, chainId?, scheduledFor? }
 * Pay a bill or schedule a bill payment.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { billerName, billerCode, accountNumber, amount, asset, chainId, scheduledFor } = body as {
      billerName?: unknown;
      billerCode?: unknown;
      accountNumber?: unknown;
      amount?: unknown;
      asset?: unknown;
      chainId?: unknown;
      scheduledFor?: unknown;
    };

    const normalizedBillerName = normalizeNonEmptyString(billerName);
    const normalizedBillerCode = normalizeNonEmptyString(billerCode);
    const normalizedAccountNumber = normalizeNonEmptyString(accountNumber);
    const normalizedAmount = normalizePositiveAmount(amount);
    const normalizedAsset = normalizeNonEmptyString(asset) || "ETH";
    const normalizedChainId = parseChainId(chainId, 421614);
    const scheduledForDate = parseOptionalDate(scheduledFor);

    if (!normalizedBillerName || !normalizedAccountNumber || !normalizedAmount) {
      return NextResponse.json(
        { error: "billerName, accountNumber, and amount are required" },
        { status: 400 }
      );
    }

    if (!normalizedChainId) {
      return NextResponse.json({ error: "chainId must be a positive integer" }, { status: 400 });
    }

    if (scheduledFor !== undefined && scheduledFor !== null && !scheduledForDate) {
      return NextResponse.json({ error: "scheduledFor must be a valid date" }, { status: 400 });
    }

    // If scheduled for future, create as SCHEDULED without debiting
    const isScheduled = !!scheduledForDate && scheduledForDate > new Date();

    if (!isScheduled) {
      // Debit immediately
      await debitWallet({
        userId: user.id,
        asset: normalizedAsset,
        amount: normalizedAmount,
        chainId: normalizedChainId,
        type: "SEND",
        status: "CONFIRMED",
        meta: { billerName: normalizedBillerName, accountNumber: normalizedAccountNumber, type: "BILL_PAYMENT" },
      });
    }

    const bill = await prisma.billPayment.create({
      data: {
        userId: user.id,
        billerName: normalizedBillerName,
        billerCode: normalizedBillerCode,
        accountNumber: normalizedAccountNumber,
        amount: normalizedAmount,
        asset: normalizedAsset,
        reference: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: isScheduled ? "SCHEDULED" : "PAID",
        scheduledFor: scheduledForDate,
        paidAt: isScheduled ? null : new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: isScheduled ? "BILL_SCHEDULED" : "BILL_PAID",
        meta: JSON.stringify({
          billId: bill.id,
          billerName: normalizedBillerName,
          amount: normalizedAmount,
          asset: normalizedAsset,
        }),
      },
    });

    // Notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: isScheduled ? "Bill Scheduled" : "Bill Paid",
        body: isScheduled
          ? `Payment of ${normalizedAmount} ${normalizedAsset} to ${normalizedBillerName} scheduled for ${scheduledForDate?.toISOString()}`
          : `Payment of ${normalizedAmount} ${normalizedAsset} to ${normalizedBillerName} completed`,
        channel: "IN_APP",
        meta: JSON.stringify({ billId: bill.id }),
      },
    });

    return NextResponse.json({ bill }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.message.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
