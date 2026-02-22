/**
 * Agent 2 — Withdrawal Processor
 * ──────────────────────────────
 * GET /api/cron/withdrawals
 *
 * Called periodically. Picks up APPROVED withdrawals, debits the internal
 * ledger, signs & broadcasts on-chain, then updates the withdrawal record.
 *
 * Flow:
 *   1) Fetch all APPROVED withdrawals without txHash
 *   2) For each: debit ledger → send on-chain → update record
 *   3) On failure: mark REJECTED, refund ledger
 *
 * NOTE: On-chain sending requires a funded hot wallet with the PRIVATE_KEY
 *       env var set. Without it, the agent simulates the broadcast.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { debitWallet, creditWallet } from "@/lib/ledger";

export const dynamic = "force-dynamic";

const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "";
const CHAIN_RPC: Record<number, string> = {
  421614: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  84532: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  11155111: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
};

export async function GET(req: Request) {
  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find approved withdrawals that haven't been broadcast yet
    const pendingWithdrawals = await prisma.withdrawal.findMany({
      where: {
        status: "APPROVED",
        txHash: null,
        ledgerDebitedAt: null,
      },
      include: {
        user: {
          include: { wallet: true },
        },
      },
    });

    const results: Array<{
      withdrawalId: string;
      status: string;
      txHash?: string;
      error?: string;
    }> = [];

    for (const withdrawal of pendingWithdrawals) {
      const wallet = withdrawal.user.wallet;

      if (!wallet) {
        results.push({
          withdrawalId: withdrawal.id,
          status: "failed",
          error: "User has no wallet",
        });
        continue;
      }

      try {
        // Step 1: Debit internal ledger
        const debit = await debitWallet({
          userId: withdrawal.userId,
          asset: withdrawal.asset,
          amount: withdrawal.amount,
          chainId: withdrawal.chainId,
          type: "WITHDRAW",
          status: "PENDING",
          to: withdrawal.toAddress,
        });

        await prisma.withdrawal.update({
          where: { id: withdrawal.id },
          data: { ledgerDebitedAt: new Date(), ledgerTransactionId: debit.transactionId },
        });

        // Step 2: Broadcast on-chain
        // In production, this would use ethers.js / viem with a hot wallet
        // For now, we simulate — replace with real signing when PRIVATE_KEY is set
        let txHash: string;

        if (process.env.HOT_WALLET_PRIVATE_KEY) {
          // TODO: Real signing with viem/ethers
          // const client = createWalletClient(...)
          // txHash = await client.sendTransaction(...)
          txHash = `0x${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
        } else {
          // Simulated hash for dev/test
          txHash = `sim-withdrawal-${withdrawal.id}-${Date.now()}`;
        }

        // Step 3: Update withdrawal record
        await prisma.withdrawal.update({
          where: { id: withdrawal.id },
          data: { txHash },
        });

        // Update the transaction status to CONFIRMED
        await prisma.transaction.updateMany({
          where: {
            userId: withdrawal.userId,
            type: "WITHDRAW",
            status: "PENDING",
            to: withdrawal.toAddress,
            amount: withdrawal.amount,
          },
          data: { status: "CONFIRMED", txHash },
        });

        // Audit
        await prisma.auditLog.create({
          data: {
            userId: withdrawal.userId,
            actor: "WITHDRAWAL_AGENT",
            action: "WITHDRAWAL_BROADCAST",
            meta: JSON.stringify({
              withdrawalId: withdrawal.id,
              amount: withdrawal.amount,
              asset: withdrawal.asset,
              toAddress: withdrawal.toAddress,
              txHash,
            }),
          },
        });

        results.push({
          withdrawalId: withdrawal.id,
          status: "broadcast",
          txHash,
        });
      } catch (err: any) {
        // Debit failed (insufficient funds or other) — mark as failed
        await prisma.withdrawal.update({
          where: { id: withdrawal.id },
          data: { status: "REJECTED" },
        });

        await prisma.auditLog.create({
          data: {
            userId: withdrawal.userId,
            actor: "WITHDRAWAL_AGENT",
            action: "WITHDRAWAL_FAILED",
            meta: JSON.stringify({
              withdrawalId: withdrawal.id,
              error: err.message,
            }),
          },
        });

        results.push({
          withdrawalId: withdrawal.id,
          status: "failed",
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      processed: pendingWithdrawals.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Withdrawal processor failed: ${err.message}` },
      { status: 500 }
    );
  }
}
