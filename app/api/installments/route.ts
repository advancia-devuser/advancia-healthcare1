import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type InstallmentFrequency = "WEEKLY" | "MONTHLY" | "CUSTOM";

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

function parsePositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseNonNegativeNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function normalizeFrequency(value: unknown): InstallmentFrequency | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "WEEKLY" || normalized === "MONTHLY" || normalized === "CUSTOM") {
    return normalized;
  }
  return null;
}

function parseStartDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") {
    return new Date();
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

/**
 * Utility: calculate due date based on frequency and index.
 */
function calculateDueDate(
  start: Date,
  frequency: InstallmentFrequency,
  index: number
): Date {
  const d = new Date(start);
  if (frequency === "WEEKLY") {
    d.setDate(d.getDate() + 7 * (index + 1));
  } else if (frequency === "MONTHLY") {
    d.setMonth(d.getMonth() + (index + 1));
  } else {
    // CUSTOM – default 30 days apart
    d.setDate(d.getDate() + 30 * (index + 1));
  }
  return d;
}

/**
 * GET /api/installments?page=1&limit=20
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInteger(searchParams.get("limit"), 20));

    const [installments, total] = await Promise.all([
      prisma.installment.findMany({
        where: { userId: user.id },
        include: { payments: { orderBy: { dueDate: "asc" } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.installment.count({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({ installments, total, page, limit });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/installments
 * Body: { totalAmount, interestRate, installmentCount, frequency, startDate, walletId? }
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      totalAmount,
      interestRate,
      installmentCount,
      frequency,
      startDate,
      walletId,
    } = body as {
      totalAmount?: unknown;
      interestRate?: unknown;
      installmentCount?: unknown;
      frequency?: unknown;
      startDate?: unknown;
      walletId?: unknown;
    };

    const total = parsePositiveNumber(totalAmount);
    const rate = parseNonNegativeNumber(interestRate);
    const count = parsePositiveInteger(
      installmentCount === undefined || installmentCount === null ? null : String(installmentCount),
      0
    );
    const normalizedFrequency = normalizeFrequency(frequency);
    const start = parseStartDate(startDate);
    const normalizedWalletId = normalizeOptionalString(walletId);

    if (!total || rate === null || count <= 0 || !normalizedFrequency || !start) {
      return NextResponse.json(
        {
          error:
            "totalAmount, interestRate, installmentCount, and frequency are required",
        },
        { status: 400 }
      );
    }

    const totalPayable = total + (total * rate) / 100;
    const installmentAmount = totalPayable / count;

    const installment = await prisma.$transaction(async (tx) => {
      const inst = await tx.installment.create({
        data: {
          userId: user.id,
          walletId: normalizedWalletId,
          totalAmount: total,
          interestRate: rate,
          totalPayable,
          installmentCount: count,
          frequency: normalizedFrequency,
          startDate: start,
          nextDueDate: calculateDueDate(start, normalizedFrequency, 0),
        },
      });

      for (let i = 0; i < count; i++) {
        await tx.installmentPayment.create({
          data: {
            installmentId: inst.id,
            dueDate: calculateDueDate(start, normalizedFrequency, i),
            amountDue: installmentAmount,
          },
        });
      }

      return inst;
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "INSTALLMENT_CREATED",
        meta: JSON.stringify({
          totalAmount: total,
          interestRate: rate,
          totalPayable,
          installmentCount: count,
          frequency: normalizedFrequency,
        }),
      },
    });

    // Re-fetch with payments
    const full = await prisma.installment.findUnique({
      where: { id: installment.id },
      include: { payments: { orderBy: { dueDate: "asc" } } },
    });

    return NextResponse.json({ installment: full }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
