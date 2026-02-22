import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

/**
 * GET /api/bills?page=1&limit=20&status=PENDING
 * Returns user's bill payment history.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));
    const status = searchParams.get("status");

    const where: any = { userId: user.id };
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
    const body = await request.json();

    const { billerName, billerCode, accountNumber, amount, asset, chainId, scheduledFor } = body;

    if (!billerName || !accountNumber || !amount) {
      return NextResponse.json(
        { error: "billerName, accountNumber, and amount are required" },
        { status: 400 }
      );
    }

    if (BigInt(amount) <= BigInt(0)) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }

    // If scheduled for future, create as SCHEDULED without debiting
    const isScheduled = scheduledFor && new Date(scheduledFor) > new Date();

    if (!isScheduled) {
      // Debit immediately
      await debitWallet({
        userId: user.id,
        asset: asset || "ETH",
        amount: String(amount),
        chainId: chainId || 421614,
        type: "SEND",
        status: "CONFIRMED",
        meta: { billerName, accountNumber, type: "BILL_PAYMENT" },
      });
    }

    const bill = await prisma.billPayment.create({
      data: {
        userId: user.id,
        billerName,
        billerCode: billerCode || null,
        accountNumber,
        amount: String(amount),
        asset: asset || "ETH",
        reference: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: isScheduled ? "SCHEDULED" : "PAID",
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
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
          billerName,
          amount,
          asset: asset || "ETH",
        }),
      },
    });

    // Notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: isScheduled ? "Bill Scheduled" : "Bill Paid",
        body: isScheduled
          ? `Payment of ${amount} ${asset || "ETH"} to ${billerName} scheduled for ${scheduledFor}`
          : `Payment of ${amount} ${asset || "ETH"} to ${billerName} completed`,
        channel: "IN_APP",
        meta: JSON.stringify({ billId: bill.id }),
      },
    });

    return NextResponse.json({ bill }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (err.message?.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
