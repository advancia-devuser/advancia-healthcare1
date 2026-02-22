/**
 * Agent 6 — Virtual Card Issuance
 * ────────────────────────────────
 * GET /api/cron/cards
 *
 * Processes APPROVED card requests:
 *   1) Calls card provider API (Stripe Issuing / Marqeta / stub)
 *   2) Assigns card number (last4)
 *   3) Updates card_requests table
 *   4) Notifies user
 *
 * In production, replace the stub with a real card provider SDK.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/* ─── Card Provider Stub ─── */

interface IssuedCard {
  providerId: string;
  last4: string;
  provider: string;
}

/**
 * Issue a virtual card via provider API.
 * Replace with real Stripe Issuing / Marqeta integration.
 */
async function issueVirtualCard(
  userId: string,
  address: string
): Promise<IssuedCard> {
  // ──── Stripe Issuing (uncomment when ready) ────
  // if (process.env.STRIPE_SECRET_KEY) {
  //   const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
  //   const cardholder = await stripe.issuing.cardholders.create({
  //     type: "individual",
  //     name: address.slice(0, 10),
  //     email: "",
  //     billing: { address: { line1: "N/A", city: "N/A", state: "N/A", postal_code: "00000", country: "US" } },
  //   });
  //   const card = await stripe.issuing.cards.create({
  //     cardholder: cardholder.id,
  //     currency: "usd",
  //     type: "virtual",
  //   });
  //   return {
  //     providerId: card.id,
  //     last4: card.last4,
  //     provider: "stripe",
  //   };
  // }

  // Simulated issuance
  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  const providerId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    providerId,
    last4,
    provider: "simulated",
  };
}

/* ─── Route ─── */

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find approved card requests that haven't been issued yet (no providerCardId)
    const pendingCards = await prisma.cardRequest.findMany({
      where: {
        status: "APPROVED",
        providerCardId: null,
      },
      include: {
        user: { select: { id: true, address: true, email: true } },
      },
    });

    const results: Array<{
      cardRequestId: string;
      status: string;
      last4?: string;
      error?: string;
    }> = [];

    for (const card of pendingCards) {
      try {
        const issued = await issueVirtualCard(
          card.userId,
          card.user.address
        );

        await prisma.cardRequest.update({
          where: { id: card.id },
          data: {
            providerCardId: issued.providerId,
            provider: issued.provider,
            last4: issued.last4,
          },
        });

        // Audit
        await prisma.auditLog.create({
          data: {
            userId: card.userId,
            actor: "CARD_AGENT",
            action: "CARD_ISSUED",
            meta: JSON.stringify({
              cardRequestId: card.id,
              provider: issued.provider,
              last4: issued.last4,
            }),
          },
        });

        results.push({
          cardRequestId: card.id,
          status: "issued",
          last4: issued.last4,
        });
      } catch (err: any) {
        await prisma.auditLog.create({
          data: {
            userId: card.userId,
            actor: "CARD_AGENT",
            action: "CARD_ISSUANCE_FAILED",
            meta: JSON.stringify({
              cardRequestId: card.id,
              error: err.message,
            }),
          },
        });

        results.push({
          cardRequestId: card.id,
          status: "failed",
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      processed: pendingCards.length,
      issued: results.filter((r) => r.status === "issued").length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Card issuance agent failed: ${err.message}` },
      { status: 500 }
    );
  }
}
