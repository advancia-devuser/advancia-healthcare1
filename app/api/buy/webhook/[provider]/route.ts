/**
 * On-Ramp Webhooks
 * ────────────────
 * POST /api/buy/webhook/[provider]
 *
 * Receives completion/failure notifications from Transak, MoonPay, and Ramp.
 * Each provider has a different payload format — we normalise and credit
 * the user's wallet via the internal ledger.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/ledger";
import crypto from "crypto";

/* ─── Signature Verification Helpers ─── */

function verifyTransakSignature(payload: string, signature: string): boolean {
  const secret = process.env.TRANSAK_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function verifyMoonPaySignature(payload: string, signature: string): boolean {
  const secret = process.env.MOONPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function verifyRampSignature(body: string, signature: string): boolean {
  const secret = process.env.RAMP_WEBHOOK_SECRET;
  if (!secret) return false;
  // Ramp uses HMAC-SHA256 with base64 encoding
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "base64"), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/* ─── Normalised Order Update ─── */

interface WebhookData {
  providerOrderId: string;
  status: "COMPLETED" | "FAILED" | "PENDING";
  cryptoAmount?: string;
  txHash?: string;
  fiatAmount?: string;
}

async function processWebhook(provider: "TRANSAK" | "MOONPAY" | "RAMP", data: WebhookData) {
  // Find the order by provider order ID
  const order = await prisma.cryptoOrder.findFirst({
    where: {
      providerOrderId: data.providerOrderId,
      provider,
    },
  });

  // If not found by providerOrderId, it might be a new webhook — try to match
  if (!order) {
    console.warn(`[Webhook] No order found for ${provider} orderId=${data.providerOrderId}`);
    return { processed: false, reason: "Order not found" };
  }

  // Already completed — idempotency
  if (order.status === "COMPLETED") {
    return { processed: true, reason: "Already completed" };
  }

  if (data.status === "COMPLETED") {
    // Update order
    await prisma.cryptoOrder.update({
      where: { id: order.id },
      data: {
        status: "COMPLETED",
        cryptoAmount: data.cryptoAmount || null,
        txHash: data.txHash || null,
        completedAt: new Date(),
      },
    });

    // Credit wallet via ledger if we have an amount
    if (data.cryptoAmount && BigInt(data.cryptoAmount) > BigInt(0)) {
      try {
        await creditWallet({
          userId: order.userId,
          asset: order.cryptoAsset,
          amount: data.cryptoAmount,
          chainId: order.chainId,
          type: "BUY",
          status: "CONFIRMED",
          txHash: data.txHash ?? `onramp-${order.id}`,
          from: `${provider}_ONRAMP`,
          to: order.walletAddress,
          meta: {
            provider,
            providerOrderId: data.providerOrderId,
            fiatAmount: order.fiatAmount,
            fiatCurrency: order.fiatCurrency,
          },
        });
      } catch (err) {
        console.error(`[Webhook] Failed to credit wallet for order ${order.id}:`, err);
      }
    }

    // Notify user
    await prisma.notification.create({
      data: {
        userId: order.userId,
        title: "Crypto Purchase Complete!",
        body: `Your ${order.cryptoAsset} purchase of $${order.fiatAmount} ${order.fiatCurrency} via ${provider} has been completed.${data.cryptoAmount ? ` You received ${data.cryptoAmount} wei.` : ""}`,
      },
    });

    return { processed: true, reason: "Completed and credited" };
  }

  if (data.status === "FAILED") {
    await prisma.cryptoOrder.update({
      where: { id: order.id },
      data: { status: "FAILED" },
    });

    await prisma.notification.create({
      data: {
        userId: order.userId,
        title: "Crypto Purchase Failed",
        body: `Your ${order.cryptoAsset} purchase of $${order.fiatAmount} ${order.fiatCurrency} via ${provider} has failed. No funds were charged.`,
      },
    });

    return { processed: true, reason: "Marked as failed" };
  }

  // Status is PENDING — update to PROCESSING
  await prisma.cryptoOrder.update({
    where: { id: order.id },
    data: { status: "PROCESSING" },
  });

  return { processed: true, reason: "Updated to processing" };
}

/* ─── Route Handler ─── */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const providerKey = provider?.toUpperCase();
  const rawBody = await req.text();

  // ─── Transak Webhook ───
  if (providerKey === "TRANSAK") {
    const sig = req.headers.get("x-transak-signature") || "";
    if (process.env.TRANSAK_WEBHOOK_SECRET && !verifyTransakSignature(rawBody, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.webhookData || payload;

    // Map Transak status
    let status: WebhookData["status"] = "PENDING";
    if (event.status === "COMPLETED") status = "COMPLETED";
    else if (["FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(event.status)) status = "FAILED";

    // Update providerOrderId on the order if we can match by partnerOrderId
    if (event.partnerOrderId && event.id) {
      await prisma.cryptoOrder.updateMany({
        where: { id: event.partnerOrderId, providerOrderId: null },
        data: { providerOrderId: event.id, status: "PROCESSING" },
      });
    }

    const result = await processWebhook("TRANSAK", {
      providerOrderId: event.id,
      status,
      cryptoAmount: event.cryptoAmount ? Math.floor(parseFloat(event.cryptoAmount) * 1e18).toString() : undefined,
      txHash: event.transactionHash || undefined,
    });

    return NextResponse.json(result);
  }

  // ─── MoonPay Webhook ───
  if (providerKey === "MOONPAY") {
    const sig = req.headers.get("moonpay-signature-v2") || req.headers.get("moonpay-signature") || "";
    if (process.env.MOONPAY_WEBHOOK_SECRET && !verifyMoonPaySignature(rawBody, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.data || payload;

    let status: WebhookData["status"] = "PENDING";
    if (event.status === "completed") status = "COMPLETED";
    else if (["failed", "expired", "refunded"].includes(event.status)) status = "FAILED";

    // Match by externalTransactionId = our order ID
    if (event.externalTransactionId && event.id) {
      await prisma.cryptoOrder.updateMany({
        where: { id: event.externalTransactionId, providerOrderId: null },
        data: { providerOrderId: event.id, status: "PROCESSING" },
      });
    }

    const result = await processWebhook("MOONPAY", {
      providerOrderId: event.id,
      status,
      cryptoAmount: event.quoteCurrencyAmount ? Math.floor(parseFloat(event.quoteCurrencyAmount) * 1e18).toString() : undefined,
      txHash: event.cryptoTransactionId || undefined,
    });

    return NextResponse.json(result);
  }

  // ─── Ramp Webhook ───
  if (providerKey === "RAMP") {
    const sig = req.headers.get("x-body-signature") || "";
    if (process.env.RAMP_WEBHOOK_SECRET && !verifyRampSignature(rawBody, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);

    let status: WebhookData["status"] = "PENDING";
    if (payload.type === "RELEASED" || payload.type === "COMPLETED") status = "COMPLETED";
    else if (["EXPIRED", "CANCELLED", "ERROR"].includes(payload.type)) status = "FAILED";

    const purchase = payload.purchase || payload;

    const result = await processWebhook("RAMP", {
      providerOrderId: purchase.id,
      status,
      cryptoAmount: purchase.cryptoAmount ? purchase.cryptoAmount.toString() : undefined,
      txHash: purchase.finalTxHash || undefined,
    });

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
}
