import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendWithdrawalEmail } from "@/lib/email";
import { sendWithdrawalSms } from "@/lib/sms";
import { debitWallet } from "@/lib/ledger";

/**
 * GET /api/admin/withdrawals?status=PENDING&page=1&limit=20
 * Admin: list all withdrawals with optional status filter.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

    const where: any = {};
    if (status) where.status = status;

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        include: { user: { select: { address: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.withdrawal.count({ where }),
    ]);

    return NextResponse.json({ withdrawals, total, page, limit });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch withdrawals" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/withdrawals
 * Body: { withdrawalId: string, action: "APPROVE" | "REJECT" }
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { withdrawalId, action } = await request.json();
    if (!withdrawalId || !action) {
      return NextResponse.json(
        { error: "withdrawalId and action are required" },
        { status: 400 }
      );
    }

    if (!["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const newStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

    const withdrawal = await prisma.$transaction(async (tx) => {
      const current = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: { user: { select: { email: true, phone: true, address: true } } },
      });

      if (!current) {
        throw new Error("Withdrawal not found");
      }

      if (current.status !== "PENDING") {
        throw new Error(`Withdrawal is not pending (current=${current.status})`);
      }

      if (action === "APPROVE") {
        // Debit once at approval time (internal-only mode).
        const debit = await debitWallet({
          userId: current.userId,
          asset: current.asset,
          amount: current.amount,
          chainId: current.chainId,
          type: "WITHDRAW",
          status: "CONFIRMED",
          to: current.toAddress,
          meta: { withdrawalId: current.id, approvedBy: "ADMIN" },
        });

        return tx.withdrawal.update({
          where: { id: current.id },
          data: {
            status: "APPROVED",
            reviewedBy: "ADMIN",
            decidedAt: new Date(),
            ledgerDebitedAt: new Date(),
            ledgerTransactionId: debit.transactionId,
          },
          include: { user: { select: { email: true, phone: true, address: true } } },
        });
      }

      return tx.withdrawal.update({
        where: { id: current.id },
        data: {
          status: "REJECTED",
          reviewedBy: "ADMIN",
          decidedAt: new Date(),
        },
        include: { user: { select: { email: true, phone: true, address: true } } },
      });
    });

    // Send email notification
    if (withdrawal.user?.email) {
      sendWithdrawalEmail(
        withdrawal.user.email,
        newStatus as any,
        String(withdrawal.amount),
        withdrawal.asset
      ).catch((err) => console.error("[EMAIL] Withdrawal email failed:", err));
    }

    // Send SMS notification
    if (withdrawal.user?.phone) {
      sendWithdrawalSms(
        withdrawal.user.phone,
        newStatus as any,
        String(withdrawal.amount),
        withdrawal.asset
      ).catch((err) => console.error("[SMS] Withdrawal SMS failed:", err));
    }

    await prisma.auditLog.create({
      data: {
        userId: withdrawal.userId,
        actor: "ADMIN",
        action: `WITHDRAWAL_${action}`,
        meta: JSON.stringify({
          withdrawalId,
          amount: withdrawal.amount,
          asset: withdrawal.asset,
        }),
      },
    });

    return NextResponse.json({ withdrawal });
  } catch (err: any) {
    if (err.message?.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || "Failed to update withdrawal" }, { status: 500 });
  }
}
