import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

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
  } catch (err: any) {
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
    const body = await request.json();
    const {
      userId,
      totalAmount,
      interestRate,
      installmentCount,
      frequency,
      startDate,
    } = body;

    if (!userId || !totalAmount || !interestRate || !installmentCount || !frequency || !startDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const totalAmountD = new Prisma.Decimal(totalAmount);
    const interestRateD = new Prisma.Decimal(interestRate);
    const totalPayable = totalAmountD.plus(totalAmountD.times(interestRateD).div(100));
    const installmentAmount = totalPayable.div(installmentCount);

    const installment = await prisma.$transaction(async (tx) => {
      const newInstallment = await tx.installment.create({
        data: {
          userId,
          totalAmount: totalAmountD,
          interestRate: interestRateD,
          totalPayable,
          installmentCount,
          frequency,
          startDate: new Date(startDate),
          nextDueDate: new Date(startDate),
        },
      });

      const payments = [];
      for (let i = 0; i < installmentCount; i++) {
        const dueDate = calculateDueDate(new Date(startDate), frequency, i);
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
