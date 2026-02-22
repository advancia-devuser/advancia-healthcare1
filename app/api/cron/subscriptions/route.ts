import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

/**
 * POST /api/cron/subscriptions
 * Processes subscription renewals.
 * Should be called daily.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Find active paid subscriptions due for renewal
    const dueSubs = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        nextBillingDate: { lte: now },
        priceAmount: { not: "0" },
      },
      include: { user: true },
      take: 50,
    });

    const results = { renewed: 0, failed: 0, errors: [] as string[] };

    for (const sub of dueSubs) {
      try {
        // Debit for renewal
        await debitWallet({
          userId: sub.userId,
          asset: sub.asset,
          amount: sub.priceAmount,
          chainId: 421614,
          type: "SEND",
          status: "CONFIRMED",
          meta: { type: "SUBSCRIPTION_RENEWAL", tier: sub.tier, subscriptionId: sub.id },
        });

        // Set next billing date
        const nextBilling = new Date(now);
        nextBilling.setMonth(nextBilling.getMonth() + 1);

        await prisma.subscription.update({
          where: { id: sub.id },
          data: { nextBillingDate: nextBilling },
        });

        await prisma.notification.create({
          data: {
            userId: sub.userId,
            title: "Subscription Renewed",
            body: `Your ${sub.tier} plan has been renewed for ${sub.priceAmount} ${sub.asset}`,
            channel: "IN_APP",
            meta: JSON.stringify({ subscriptionId: sub.id }),
          },
        });

        results.renewed++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Sub ${sub.id}: ${err.message}`);

        // Mark as expired if billing fails
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "EXPIRED" },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total: dueSubs.length,
      ...results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
