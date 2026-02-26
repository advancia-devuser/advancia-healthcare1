/**
 * Health Transactions API
 * ───────────────────────
 * POST /api/health/transactions → Pay medical bill / insurance premium via wallet
 * GET  /api/health/transactions → Health transaction history
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApprovedUser } from "@/lib/auth";
import { debitWallet } from "@/lib/ledger";
import { HealthTransactionStatus } from "@prisma/client";

const HEALTH_TRANSACTION_STATUSES = new Set<HealthTransactionStatus>([
  HealthTransactionStatus.PENDING,
  HealthTransactionStatus.COMPLETED,
  HealthTransactionStatus.FAILED,
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

function normalizeHealthTxStatus(value: string | null): HealthTransactionStatus | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return HEALTH_TRANSACTION_STATUSES.has(normalized as HealthTransactionStatus)
    ? (normalized as HealthTransactionStatus)
    : null;
}

function normalizeBigIntAmount(value: unknown): string | null {
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

/* ─── GET — Health transaction history ─── */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status"); // PENDING, COMPLETED, FAILED
    const status = normalizeHealthTxStatus(rawStatus);
    const healthCardId = normalizeNonEmptyString(searchParams.get("healthCardId"));
    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInteger(searchParams.get("limit"), 20));
    const skip = (page - 1) * limit;

    if (rawStatus && !status) {
      return NextResponse.json({ error: "status must be PENDING, COMPLETED, or FAILED" }, { status: 400 });
    }

    const where: { userId: string; status?: HealthTransactionStatus; healthCardId?: string } = { userId: user.id };
    if (status) where.status = status;
    if (healthCardId) where.healthCardId = healthCardId;

    const [transactions, total] = await Promise.all([
      prisma.healthTransaction.findMany({
        where,
        include: {
          healthCard: {
            select: {
              id: true,
              providerName: true,
              cardType: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.healthTransaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health transactions GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── POST — Pay medical bill via wallet ─── */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { healthCardId, amount, description, currency } = body as {
      healthCardId?: unknown;
      amount?: unknown;
      description?: unknown;
      currency?: unknown;
    };

    const normalizedHealthCardId = normalizeNonEmptyString(healthCardId);
    const normalizedAmount = normalizeBigIntAmount(amount);
    const normalizedDescription = normalizeNonEmptyString(description);
    const normalizedCurrency = normalizeNonEmptyString(currency) || "USD";

    if (!normalizedAmount || !normalizedDescription) {
      return NextResponse.json(
        { error: "amount and description are required" },
        { status: 400 }
      );
    }

    // Verify health card if provided
    if (normalizedHealthCardId) {
      const card = await prisma.healthCard.findFirst({
        where: { id: normalizedHealthCardId, userId: user.id, status: "ACTIVE" },
      });
      if (!card) {
        return NextResponse.json(
          { error: "Health card not found or inactive" },
          { status: 404 }
        );
      }
    }

    // Get user's wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });

    if (!wallet) {
      return NextResponse.json(
        { error: "No wallet found" },
        { status: 404 }
      );
    }

    const reference = `HEALTH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create health transaction record first (PENDING)
    const healthTx = await prisma.healthTransaction.create({
      data: {
        userId: user.id,
        healthCardId: normalizedHealthCardId ?? null,
        amount: normalizedAmount,
        asset: "ETH",
        currency: normalizedCurrency,
        status: "PENDING",
        description: normalizedDescription,
        reference,
      },
    });

    // Debit wallet via internal ledger
    try {
      await debitWallet({
        userId: user.id,
        asset: "ETH",
        amount: normalizedAmount,
        chainId: wallet.chainId,
        type: "SEND",
        txHash: `health-payment-${healthTx.id}`,
        from: wallet.smartAccountAddress,
        meta: {
          healthTransactionId: healthTx.id,
          description: normalizedDescription,
          reference,
        },
      });

      // Update health transaction to COMPLETED
      await prisma.healthTransaction.update({
        where: { id: healthTx.id },
        data: { status: "COMPLETED" },
      });

      // Notify user
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: "Health Payment Completed",
          body: `Payment of ${normalizedAmount} wei for "${normalizedDescription}" processed successfully.`,
          channel: "IN_APP",
          meta: JSON.stringify({ healthTransactionId: healthTx.id, reference }),
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          actor: user.address,
          action: "HEALTH_PAYMENT_COMPLETED",
          meta: JSON.stringify({
            healthTransactionId: healthTx.id,
            amount: normalizedAmount,
            description: normalizedDescription,
            reference,
          }),
        },
      });

      return NextResponse.json({
        transaction: {
          ...healthTx,
          status: "COMPLETED",
        },
        reference,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Payment failed";

      // Mark transaction as FAILED
      await prisma.healthTransaction.update({
        where: { id: healthTx.id },
        data: { status: "FAILED" },
      });

      if (message.includes("Insufficient balance")) {
        return NextResponse.json(
          { error: "Insufficient wallet balance" },
          { status: 400 }
        );
      }

      throw err;
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health transactions POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
