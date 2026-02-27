import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InstallmentFrequency, Prisma } from "@prisma/client";

const INSTALLMENT_FREQUENCY_VALUES = new Set<InstallmentFrequency>([
  InstallmentFrequency.WEEKLY,
  InstallmentFrequency.MONTHLY,
  InstallmentFrequency.CUSTOM,
]);

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function isInstallmentFrequency(value: unknown): value is InstallmentFrequency {
  return (
    typeof value === "string" &&
    INSTALLMENT_FREQUENCY_VALUES.has(value as InstallmentFrequency)
  );
}

function parseDecimal(value: unknown): Prisma.Decimal | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  try {
    return new Prisma.Decimal(value as Prisma.Decimal.Value);
  } catch {
    return null;
  }
}

// Helper to calculate due dates
function calculateDueDate(startDate: Date, frequency: string, index: number): Date {
  const date = new Date(startDate);
  if (frequency === "WEEKLY") {
    date.setDate(date.getDate() + 7 * (index + 1));
  } else if (frequency === "MONTHLY") {
    date.setMonth(date.getMonth() + (index + 1));
  }
  return date;
}

/**
 * GET /api/admin/installments
 * Admin: list all installment plans.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInt(searchParams.get("limit"), 20));

    const [installments, total] = await Promise.all([
      prisma.installment.findMany({
        include: { user: { select: { address: true, email: true } }, payments: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.installment.count(),
    ]);

    return NextResponse.json({ installments, total, page, limit });
  } catch {
    return NextResponse.json({ error: "Failed to fetch installments" }, { status: 500 });
  }
}

/**
 * POST /api/admin/installments
 * Admin: create a new installment plan for a user.
 * Body: { userId, totalAmount, interestRate, installmentCount, frequency, startDate }
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      userId,
      totalAmount,
      interestRate,
      installmentCount,
      frequency,
      startDate,
    } = body as {
      userId?: unknown;
      totalAmount?: unknown;
      interestRate?: unknown;
      installmentCount?: unknown;
      frequency?: unknown;
      startDate?: unknown;
    };

    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const totalAmountD = parseDecimal(totalAmount);
    const interestRateD = parseDecimal(interestRate);
    if (!totalAmountD || !interestRateD) {
      return NextResponse.json(
        { error: "totalAmount and interestRate must be valid decimal values" },
        { status: 400 }
      );
    }

    if (totalAmountD.lte(0)) {
      return NextResponse.json({ error: "totalAmount must be greater than 0" }, { status: 400 });
    }

    if (interestRateD.lt(0)) {
      return NextResponse.json({ error: "interestRate cannot be negative" }, { status: 400 });
    }

    const installmentCountN =
      typeof installmentCount === "number"
        ? Math.trunc(installmentCount)
        : Number.parseInt(String(installmentCount || ""), 10);

    if (!Number.isFinite(installmentCountN) || installmentCountN <= 0) {
      return NextResponse.json(
        { error: "installmentCount must be a positive integer" },
        { status: 400 }
      );
    }

    if (!isInstallmentFrequency(frequency)) {
      return NextResponse.json(
        { error: "Invalid frequency. Allowed values: WEEKLY, MONTHLY, CUSTOM" },
        { status: 400 }
      );
    }

    if (typeof startDate !== "string") {
      return NextResponse.json({ error: "startDate is required" }, { status: 400 });
    }

    const parsedStartDate = new Date(startDate);
    if (Number.isNaN(parsedStartDate.getTime())) {
      return NextResponse.json({ error: "startDate must be a valid date" }, { status: 400 });
    }

    const totalPayable = totalAmountD.plus(totalAmountD.times(interestRateD).div(100));
    const installmentAmount = totalPayable.div(installmentCountN);

    const installment = await prisma.$transaction(async (tx) => {
      const newInstallment = await tx.installment.create({
        data: {
          userId: userId.trim(),
          totalAmount: totalAmountD,
          interestRate: interestRateD,
          totalPayable,
          installmentCount: installmentCountN,
          frequency,
          startDate: parsedStartDate,
          nextDueDate: parsedStartDate,
        },
      });

      const payments = [];
      for (let i = 0; i < installmentCountN; i++) {
        const dueDate = calculateDueDate(parsedStartDate, frequency, i);
        payments.push(
          tx.installmentPayment.create({
            data: {
              installmentId: newInstallment.id,
              dueDate,
              amountDue: installmentAmount,
            },
          })
        );
      }
      await Promise.all(payments);

      return newInstallment;
    });

    return NextResponse.json({ installment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create installment" }, { status: 500 });
  }
}
