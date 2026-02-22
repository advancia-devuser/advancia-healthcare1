/**
 * Agent 3 — Ledger Reconciliation
 * ────────────────────────────────
 * GET /api/cron/reconcile
 *
 * Called periodically (e.g. daily). Compares each wallet's internal ledger
 * balance against the sum of all confirmed transactions. Flags discrepancies
 * in the audit log.
 *
 * Optionally compares against on-chain balance via Alchemy if API key is set.
 *
 * Flow:
 *   1) For each wallet, sum all CONFIRMED transactions (credits − debits)
 *   2) Compare to wallet.balance
 *   3) If mismatch → flag in AuditLog with action "RECONCILE_MISMATCH"
 *   4) If on-chain check enabled → compare internal vs on-chain too
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "";
const CHAIN_RPC: Record<number, string> = {
  421614: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  84532: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  11155111: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
};

async function getOnChainBalance(
  address: string,
  chainId: number
): Promise<string | null> {
  const rpcUrl = CHAIN_RPC[chainId];
  if (!rpcUrl || !ALCHEMY_API_KEY) return null;

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });
    const data = await res.json();
    if (data?.result) {
      return BigInt(data.result).toString();
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wallets = await prisma.wallet.findMany({
      include: { user: true },
    });

    const results: Array<{
      walletId: string;
      userId: string;
      address: string;
      ledgerBalance: string;
      computedBalance: string;
      onChainBalance: string | null;
      ledgerMatch: boolean;
      onChainMatch: boolean | null;
    }> = [];

    let mismatches = 0;

    for (const wallet of wallets) {
      // Sum all CONFIRMED credits (RECEIVE)
      const credits = await prisma.transaction.findMany({
        where: {
          userId: wallet.userId,
          type: "RECEIVE",
          status: "CONFIRMED",
        },
        select: { amount: true },
      });

      // Sum all CONFIRMED debits (SEND, WITHDRAW, CONVERT)
      const debits = await prisma.transaction.findMany({
        where: {
          userId: wallet.userId,
          type: { in: ["SEND", "WITHDRAW", "CONVERT"] },
          status: "CONFIRMED",
        },
        select: { amount: true },
      });

      const totalCredits = credits.reduce(
        (sum, tx) => sum + BigInt(tx.amount),
        BigInt(0)
      );
      const totalDebits = debits.reduce(
        (sum, tx) => sum + BigInt(tx.amount),
        BigInt(0)
      );
      const computedBalance = (totalCredits - totalDebits).toString();

      const ledgerMatch = wallet.balance === computedBalance;

      // On-chain check
      const onChainBalance = await getOnChainBalance(
        wallet.smartAccountAddress,
        wallet.chainId
      );
      const onChainMatch =
        onChainBalance !== null ? wallet.balance === onChainBalance : null;

      if (!ledgerMatch) {
        mismatches++;
        await prisma.auditLog.create({
          data: {
            userId: wallet.userId,
            actor: "RECONCILIATION_AGENT",
            action: "RECONCILE_MISMATCH",
            meta: JSON.stringify({
              walletId: wallet.id,
              ledgerBalance: wallet.balance,
              computedBalance,
              difference: (
                BigInt(wallet.balance) - BigInt(computedBalance)
              ).toString(),
            }),
          },
        });
      }

      if (onChainBalance !== null && !onChainMatch) {
        await prisma.auditLog.create({
          data: {
            userId: wallet.userId,
            actor: "RECONCILIATION_AGENT",
            action: "ONCHAIN_BALANCE_MISMATCH",
            meta: JSON.stringify({
              walletId: wallet.id,
              internalBalance: wallet.balance,
              onChainBalance,
              difference: (
                BigInt(wallet.balance) - BigInt(onChainBalance)
              ).toString(),
            }),
          },
        });
      }

      results.push({
        walletId: wallet.id,
        userId: wallet.userId,
        address: wallet.smartAccountAddress,
        ledgerBalance: wallet.balance,
        computedBalance,
        onChainBalance,
        ledgerMatch,
        onChainMatch,
      });
    }

    return NextResponse.json({
      total: wallets.length,
      mismatches,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Reconciliation failed: ${err.message}` },
      { status: 500 }
    );
  }
}
