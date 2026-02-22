/**
 * Health Transaction Processor (Cron)
 * ────────────────────────────────────
 * Processes PENDING health transactions that haven't been paid yet.
 * This handles retries for transactions that were created but the
 * wallet debit failed on the first attempt.
 *
 * Trigger: GET /api/cron/health-transactions
 * Recommended schedule: Every 10 minutes
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { processed: 0, completed: 0, failed: 0 };

  try {
    const now = new Date();

    // Find PENDING health transactions older than 1 minute (to avoid racing
    // with the synchronous POST handler that already tried once)
    const oneMinuteAgo = new Date(now.getTime() - 60_000);

    const pendingTxs = await prisma.healthTransaction.findMany({
      where: {
        status: "PENDING",
        createdAt: { lte: oneMinuteAgo },
      },
      include: {
        user: {
          include: {
            wallet: true,
          },
        },
      },
    });

    results.processed = pendingTxs.length;

    for (const tx of pendingTxs) {
      try {
        const wallet = tx.user?.wallet;

        if (!wallet) {
          // No wallet — mark as failed
          await prisma.healthTransaction.update({
            where: { id: tx.id },
            data: { status: "FAILED" },
          });
          results.failed++;
          continue;
        }

        // Check if ledger already has this transaction (idempotency)
        const existingLedgerTx = await prisma.transaction.findFirst({
          where: { txHash: `health-payment-${tx.id}` },
        });

        if (existingLedgerTx) {
          // Already debited — just update status
          await prisma.healthTransaction.update({
            where: { id: tx.id },
            data: { status: "COMPLETED" },
          });
          results.completed++;
          continue;
        }

        // Attempt debit
        await debitWallet({
          userId: tx.userId,
          asset: tx.asset,
          amount: tx.amount,
          chainId: wallet.chainId,
          type: "SEND",
          txHash: `health-payment-${tx.id}`,
          from: wallet.smartAccountAddress,
          meta: {
            healthTransactionId: tx.id,
            description: tx.description,
            reference: tx.reference,
            retried: true,
          },
        });

        await prisma.healthTransaction.update({
          where: { id: tx.id },
          data: { status: "COMPLETED" },
        });

        // Notify user
        await prisma.notification.create({
          data: {
            userId: tx.userId,
            title: "Health Payment Retry Succeeded",
            body: `Your health payment of ${tx.amount} wei for "${tx.description}" has been processed.`,
            channel: "IN_APP",
            meta: JSON.stringify({
              healthTransactionId: tx.id,
              reference: tx.reference,
            }),
          },
        });

        results.completed++;
      } catch (err) {
        console.error(`Failed to process health tx ${tx.id}:`, err);

        // Check retry count (if it's been pending too long, mark failed)
        const ageMs = now.getTime() - tx.createdAt.getTime();
        const maxAgeMs = 24 * 60 * 60_000; // 24 hours

        if (ageMs > maxAgeMs) {
          await prisma.healthTransaction.update({
            where: { id: tx.id },
            data: { status: "FAILED" },
          });

          await prisma.notification.create({
            data: {
              userId: tx.userId,
              title: "Health Payment Failed",
              body: `Your health payment of ${tx.amount} wei for "${tx.description}" has failed after multiple attempts.`,
              channel: "IN_APP",
            },
          });
        }

        results.failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (e) {
    console.error("Health transaction processor error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", ...results },
      { status: 500 }
    );
  }
}
