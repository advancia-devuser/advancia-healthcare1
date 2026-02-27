import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendWithdrawalEmail } from "@/lib/email";
import { sendWithdrawalSms } from "@/lib/sms";
import { debitWallet } from "@/lib/ledger";
import { RequestStatus } from "@prisma/client";

const REQUEST_STATUS_VALUES = new Set<RequestStatus>([
  RequestStatus.PENDING,
  RequestStatus.APPROVED,
  RequestStatus.REJECTED,
]);

type AdminWithdrawalAction = "APPROVE" | "REJECT";

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && REQUEST_STATUS_VALUES.has(value as RequestStatus);
}

function isAdminWithdrawalAction(value: unknown): value is AdminWithdrawalAction {
  return value === "APPROVE" || value === "REJECT";
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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
    const rawStatus = searchParams.get("status");
    const candidateStatus = rawStatus ? rawStatus.trim().toUpperCase() : undefined;
    if (candidateStatus && !isRequestStatus(candidateStatus)) {
      return NextResponse.json(
        { error: "Invalid status. Allowed values: PENDING, APPROVED, REJECTED" },
        { status: 400 }
      );
    }

    const status: RequestStatus | undefined =
      candidateStatus && isRequestStatus(candidateStatus) ? candidateStatus : undefined;

    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInt(searchParams.get("limit"), 20));

    const where: { status?: RequestStatus } = {};
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
  } catch {
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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { withdrawalId, action } = body as { withdrawalId?: unknown; action?: unknown };

    if (typeof withdrawalId !== "string" || !withdrawalId.trim()) {
      return NextResponse.json(
        { error: "withdrawalId is required" },
        { status: 400 }
      );
    }

    if (!isAdminWithdrawalAction(action)) {
      return NextResponse.json(
        { error: "Invalid action. Allowed values: APPROVE, REJECT" },
        { status: 400 }
      );
    }

    const newStatus: RequestStatus = action === "APPROVE" ? RequestStatus.APPROVED : RequestStatus.REJECTED;
    const notificationStatus: "APPROVED" | "REJECTED" =
      action === "APPROVE" ? "APPROVED" : "REJECTED";

    const withdrawal = await prisma.$transaction(async (tx) => {
      const current = await tx.withdrawal.findUnique({
        where: { id: withdrawalId.trim() },
        include: { user: { select: { email: true, phone: true, address: true } } },
      });

      if (!current) {
        throw new HttpError(404, "Withdrawal not found");
      }

      if (current.status !== "PENDING") {
        throw new HttpError(409, `Withdrawal is not pending (current=${current.status})`);
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
        notificationStatus,
        String(withdrawal.amount),
        withdrawal.asset
      ).catch((err) => console.error("[EMAIL] Withdrawal email failed:", err));
    }

    // Send SMS notification
    if (withdrawal.user?.phone) {
      sendWithdrawalSms(
        withdrawal.user.phone,
        notificationStatus,
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
          withdrawalId: withdrawal.id,
          amount: withdrawal.amount,
          asset: withdrawal.asset,
        }),
      },
    });

    return NextResponse.json({ withdrawal });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    if (err instanceof Error && err.message.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to update withdrawal" }, { status: 500 });
  }
}
