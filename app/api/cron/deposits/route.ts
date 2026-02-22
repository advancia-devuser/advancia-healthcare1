/**
 * Agent 1 — Deposit Listener
 * ──────────────────────────
 * GET /api/cron/deposits
 *
 * Called periodically (e.g. every 30s by Vercel Cron or external scheduler).
 * For each user wallet, checks the Alchemy API for recent incoming transfers.
 * Credits the internal ledger for any new deposits not yet recorded.
 *
 * Flow:
 *   1) Fetch all wallets from DB
 *   2) For each wallet, call Alchemy getAssetTransfers (incoming)
 *   3) Filter transfers not already in `transactions` table (by txHash)
 *   4) Credit internal ledger via lib/ledger
 *   5) Log results
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/ledger";

const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "";
const CHAIN_RPC: Record<number, string> = {
  421614: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  84532: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  11155111: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
};

interface AlchemyTransfer {
  hash: string;
  from: string;
  to: string;
  value: number | null;
  asset: string;
  rawContract: { value: string; address: string | null; decimal: string };
  category: string;
}

export const dynamic = "force-dynamic";

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

    const wallets = await prisma.wallet.findMany({
      include: { user: true },
    });

    if (!ALCHEMY_API_KEY) {
      return NextResponse.json(
        { error: "ALCHEMY_API_KEY not set", processed: 0 },
        { status: 200 }
      );
    }

    const results: Array<{
      walletId: string;
      address: string;
      depositsFound: number;
      credited: number;
      errors: string[];
    }> = [];

    for (const wallet of wallets) {
      const rpcUrl = CHAIN_RPC[wallet.chainId];
      if (!rpcUrl) {
        results.push({
          walletId: wallet.id,
          address: wallet.smartAccountAddress,
          depositsFound: 0,
          credited: 0,
          errors: [`Unsupported chainId: ${wallet.chainId}`],
        });
        continue;
      }

      const entry = {
        walletId: wallet.id,
        address: wallet.smartAccountAddress,
        depositsFound: 0,
        credited: 0,
        errors: [] as string[],
      };

      try {
        // Get incoming transfers for this address
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "alchemy_getAssetTransfers",
            params: [
              {
                fromBlock: "0x0",
                toAddress: wallet.smartAccountAddress,
                category: ["external", "erc20"],
                order: "desc",
                maxCount: "0x14", // last 20
                withMetadata: true,
              },
            ],
          }),
        });

        const data = await res.json();
        const transfers: AlchemyTransfer[] =
          data?.result?.transfers || [];

        entry.depositsFound = transfers.length;

        // Filter out already-recorded transfers
        for (const transfer of transfers) {
          if (!transfer.hash) continue;

          const exists = await prisma.transaction.findFirst({
            where: { txHash: transfer.hash, userId: wallet.userId },
          });

          if (exists) continue; // Already credited

          // Calculate amount in wei
          let amountWei: string;
          if (transfer.rawContract?.value) {
            amountWei = BigInt(transfer.rawContract.value).toString();
          } else if (transfer.value !== null) {
            amountWei = BigInt(
              Math.floor(transfer.value * 1e18)
            ).toString();
          } else {
            entry.errors.push(`No value for tx ${transfer.hash}`);
            continue;
          }

          try {
            await creditWallet({
              userId: wallet.userId,
              asset: transfer.asset || "ETH",
              amount: amountWei,
              chainId: wallet.chainId,
              type: "RECEIVE",
              status: "CONFIRMED",
              txHash: transfer.hash,
              from: transfer.from,
              to: transfer.to,
            });
            entry.credited++;
          } catch (err: any) {
            // Duplicate txHash or other ledger error
            entry.errors.push(
              `Credit failed for ${transfer.hash}: ${err.message}`
            );
          }
        }
      } catch (err: any) {
        entry.errors.push(`RPC error: ${err.message}`);
      }

      results.push(entry);
    }

    const totalCredited = results.reduce((s, r) => s + r.credited, 0);

    return NextResponse.json({
      processed: wallets.length,
      totalCredited,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Deposit listener failed: ${err.message}` },
      { status: 500 }
    );
  }
}
