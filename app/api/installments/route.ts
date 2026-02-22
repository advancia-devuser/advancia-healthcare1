import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Utility: calculate due date based on frequency and index.
 */
function calculateDueDate(
  start: Date,
  frequency: string,
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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

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
    const body = await request.json();

    const {
      totalAmount,
      interestRate,
      installmentCount,
      frequency,
      startDate,
      walletId,
    } = body;

    if (!totalAmount || interestRate == null || !installmentCount || !frequency) {
      return NextResponse.json(
        {
          error:
            "totalAmount, interestRate, installmentCount, and frequency are required",
        },
        { status: 400 }
      );
    }

    const total = parseFloat(totalAmount);
    const rate = parseFloat(interestRate);
    const count = parseInt(installmentCount);
    const totalPayable = total + (total * rate) / 100;
    const installmentAmount = totalPayable / count;
    const start = startDate ? new Date(startDate) : new Date();

    const installment = await prisma.$transaction(async (tx) => {
      const inst = await tx.installment.create({
        data: {
          userId: user.id,
          walletId: walletId || null,
          totalAmount: total,
          interestRate: rate,
          totalPayable,
          installmentCount: count,
          frequency: frequency as any,
          startDate: start,
          nextDueDate: calculateDueDate(start, frequency, 0),
        },
      });

      for (let i = 0; i < count; i++) {
        await tx.installmentPayment.create({
          data: {
            installmentId: inst.id,
            dueDate: calculateDueDate(start, frequency, i),
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
          frequency,
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
