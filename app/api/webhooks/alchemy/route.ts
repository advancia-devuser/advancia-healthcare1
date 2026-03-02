import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/ledger";
import { logger } from "@/lib/logger";

// This is the Webhook that is called by Alchemy when a new transaction is detected
// The payload is a Webhook object from Alchemy
// https://docs.alchemy.com/reference/alchemy-webhooks

/* ─── Types for Alchemy Address Activity webhook ─── */

interface AlchemyActivity {
  fromAddress: string;
  toAddress: string;
  value: number;
  asset: string;
  hash: string;
  category: string; // "external" | "internal" | "erc20" | "erc721" | "erc1155"
  rawContract?: {
    rawValue?: string;
    address?: string | null;
    decimals?: number;
  };
}

interface AlchemyWebhookEvent {
  network: string;
  activity: AlchemyActivity[];
}

interface AlchemyWebhookBody {
  webhookId?: string;
  id?: string;
  createdAt?: string;
  type?: string;
  event?: AlchemyWebhookEvent;
}

/* ─── Chain ID mapping from Alchemy network strings ─── */
const NETWORK_TO_CHAIN_ID: Record<string, number> = {
  ETH_MAINNET: 1,
  ETH_SEPOLIA: 11155111,
  ARB_MAINNET: 42161,
  ARB_SEPOLIA: 421614,
  BASE_MAINNET: 8453,
  BASE_SEPOLIA: 84532,
  MATIC_MAINNET: 137,
  MATIC_AMOY: 80002,
};

/**
 * Handles GET requests to the webhook endpoint.
 * This can be used for simple verification checks.
 */
export async function GET() {
  return NextResponse.json({ message: "Alchemy Webhook endpoint is active." });
}

export async function POST(req: Request) {
  const webhookSecret = process.env.ALCHEMY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("ALCHEMY_WEBHOOK_SECRET is not set");
    return new Response("Internal Server Error", { status: 500 });
  }

  // Get the token from the headers
  const token = req.headers.get("x-alchemy-token");
  if (token !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body: AlchemyWebhookBody = await req.json();

    // Log the webhook payload for inspection (dev only)
    if (process.env.NODE_ENV !== "production") {
      logger.debug("Received Alchemy Webhook", { body });
    }

    const processed: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    const event = body.event;
    if (event && Array.isArray(event.activity)) {
      const chainId = NETWORK_TO_CHAIN_ID[event.network] ?? 421614;

      for (const activity of event.activity) {
        const txHash = activity.hash;

        // Skip if we've already recorded this transaction
        if (txHash) {
          const existing = await prisma.transaction.findFirst({
            where: { txHash },
          });
          if (existing) {
            skipped.push(txHash);
            continue;
          }
        }

        try {
          // Look up recipient — incoming transfers credit the toAddress user
          const recipientWallet = await prisma.wallet.findFirst({
            where: {
              smartAccountAddress: {
                equals: activity.toAddress,
                mode: "insensitive",
              },
            },
            include: { user: true },
          });

          if (recipientWallet) {
            // Determine amount as base-10 integer string (wei for ETH)
            const rawValue =
              activity.rawContract?.rawValue ??
              Math.floor(activity.value * 1e18).toString();
            const amount =
              rawValue.startsWith("0x")
                ? BigInt(rawValue).toString()
                : rawValue;

            // Credit internal ledger
            await creditWallet({
              userId: recipientWallet.userId,
              asset: activity.asset || "ETH",
              amount,
              chainId,
              type: "RECEIVE",
              status: "CONFIRMED",
              txHash: txHash || undefined,
              from: activity.fromAddress,
              to: activity.toAddress,
            });

            // Create in-app notification
            await prisma.notification.create({
              data: {
                userId: recipientWallet.userId,
                title: "Deposit Received",
                body: `Received ${activity.value} ${activity.asset || "ETH"} from ${activity.fromAddress.slice(0, 6)}...${activity.fromAddress.slice(-4)}`,
                channel: "IN_APP",
                meta: JSON.stringify({
                  txHash,
                  fromAddress: activity.fromAddress,
                  toAddress: activity.toAddress,
                  value: activity.value,
                  asset: activity.asset,
                  category: activity.category,
                }),
              },
            });

            processed.push(txHash || "no-hash");
          }

          // Also check if the sender is one of our users (outgoing transfer notification)
          const senderWallet = await prisma.wallet.findFirst({
            where: {
              smartAccountAddress: {
                equals: activity.fromAddress,
                mode: "insensitive",
              },
            },
            include: { user: true },
          });

          if (senderWallet) {
            await prisma.notification.create({
              data: {
                userId: senderWallet.userId,
                title: "Transfer Sent",
                body: `Sent ${activity.value} ${activity.asset || "ETH"} to ${activity.toAddress.slice(0, 6)}...${activity.toAddress.slice(-4)}`,
                channel: "IN_APP",
                meta: JSON.stringify({
                  txHash,
                  fromAddress: activity.fromAddress,
                  toAddress: activity.toAddress,
                  value: activity.value,
                  asset: activity.asset,
                  category: activity.category,
                }),
              },
            });
          }
        } catch (err: any) {
          errors.push(`${txHash ?? "unknown"}: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: processed.length,
      skipped: skipped.length,
      errors: errors.length,
      details: { processed, skipped, errors },
    });
  } catch (error) {
    logger.error("Error processing webhook", { err: error instanceof Error ? error : String(error) });
    return new Response("Error processing webhook", { status: 500 });
  }
}
