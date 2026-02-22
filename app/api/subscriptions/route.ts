import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

/**
 * GET /api/subscriptions
 * Returns user's subscriptions.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const subscriptions = await prisma.subscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ subscriptions });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/subscriptions
 * Body: { tier, asset?, chainId? }
 * Subscribe or upgrade to a tier.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();

    const { tier, asset, chainId } = body;

    if (!tier) {
      return NextResponse.json({ error: "tier is required" }, { status: 400 });
    }

    // Pricing table
    const pricing: Record<string, string> = {
      FREE: "0",
      BASIC: "10000000000000000",    // 0.01 ETH
      PREMIUM: "50000000000000000",  // 0.05 ETH
      ENTERPRISE: "100000000000000000", // 0.1 ETH
    };

    const priceAmount = pricing[tier];
    if (priceAmount === undefined) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    // Cancel existing active subscription
    await prisma.subscription.updateMany({
      where: { userId: user.id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    // Debit for paid tiers
    if (BigInt(priceAmount) > BigInt(0)) {
      await debitWallet({
        userId: user.id,
        asset: asset || "ETH",
        amount: priceAmount,
        chainId: chainId || 421614,
        type: "SEND",
        status: "CONFIRMED",
        meta: { type: "SUBSCRIPTION", tier },
      });
    }

    const now = new Date();
    const nextBilling = new Date(now);
    nextBilling.setMonth(nextBilling.getMonth() + 1);

    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        tier: tier as any,
        status: "ACTIVE",
        priceAmount,
        asset: asset || "ETH",
        startDate: now,
        nextBillingDate: BigInt(priceAmount) > BigInt(0) ? nextBilling : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "SUBSCRIPTION_CREATED",
        meta: JSON.stringify({ subscriptionId: subscription.id, tier, priceAmount }),
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Subscription Active",
        body: `You've subscribed to the ${tier} plan`,
        channel: "IN_APP",
        meta: JSON.stringify({ subscriptionId: subscription.id }),
      },
    });

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (err.message?.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/subscriptions
 * Body: { subscriptionId, action: "cancel" | "pause" | "resume" }
 * Manage subscription status.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();
    const { subscriptionId, action } = body;

    if (!subscriptionId || !action) {
      return NextResponse.json(
        { error: "subscriptionId and action are required" },
        { status: 400 }
      );
    }

    const sub = await prisma.subscription.findFirst({
      where: { id: subscriptionId, userId: user.id },
    });

    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const updateData: any = {};
    switch (action) {
      case "cancel":
        updateData.status = "CANCELLED";
        updateData.cancelledAt = new Date();
        break;
      case "pause":
        updateData.status = "PAUSED";
        break;
      case "resume":
        updateData.status = "ACTIVE";
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: updateData,
    });

    return NextResponse.json({ subscription: updated });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
