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

/* ─── GET — Health transaction history ─── */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // PENDING, COMPLETED, FAILED
    const healthCardId = searchParams.get("healthCardId");
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "20");
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId: user.id };
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
    const body = await request.json();

    const { healthCardId, amount, description, currency } = body;

    if (!amount || !description) {
      return NextResponse.json(
        { error: "amount and description are required" },
        { status: 400 }
      );
    }

    // Validate amount
    try {
      if (BigInt(amount) <= BigInt(0)) {
        return NextResponse.json(
          { error: "Amount must be positive" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid amount format" },
        { status: 400 }
      );
    }

    // Verify health card if provided
    if (healthCardId) {
      const card = await prisma.healthCard.findFirst({
        where: { id: healthCardId, userId: user.id, status: "ACTIVE" },
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
        healthCardId: healthCardId ?? null,
        amount,
        asset: "ETH",
        currency: currency ?? "USD",
        status: "PENDING",
        description,
        reference,
      },
    });

    // Debit wallet via internal ledger
    try {
      await debitWallet({
        userId: user.id,
        asset: "ETH",
        amount,
        chainId: wallet.chainId,
        type: "SEND",
        txHash: `health-payment-${healthTx.id}`,
        from: wallet.smartAccountAddress,
        meta: {
          healthTransactionId: healthTx.id,
          description,
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
          body: `Payment of ${amount} wei for "${description}" processed successfully.`,
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
            amount,
            description,
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
