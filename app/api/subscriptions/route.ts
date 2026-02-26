import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";
import { SubscriptionStatus, SubscriptionTier } from "@prisma/client";

type SubscriptionAction = "cancel" | "pause" | "resume";

const TIER_PRICING: Record<SubscriptionTier, string> = {
  FREE: "0",
  BASIC: "10000000000000000",
  PREMIUM: "50000000000000000",
  ENTERPRISE: "100000000000000000",
};

const SUBSCRIPTION_TIER_VALUES = new Set<SubscriptionTier>([
  SubscriptionTier.FREE,
  SubscriptionTier.BASIC,
  SubscriptionTier.PREMIUM,
  SubscriptionTier.ENTERPRISE,
]);

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseChainId(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null) {
    return fallback;
  }

  const parsed = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function isSubscriptionTier(value: unknown): value is SubscriptionTier {
  return typeof value === "string" && SUBSCRIPTION_TIER_VALUES.has(value as SubscriptionTier);
}

function normalizeSubscriptionAction(value: unknown): SubscriptionAction | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "cancel" || normalized === "pause" || normalized === "resume"
    ? normalized
    : null;
}

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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { tier, asset, chainId } = body as {
      tier?: unknown;
      asset?: unknown;
      chainId?: unknown;
    };

    if (!isSubscriptionTier(tier)) {
      return NextResponse.json({ error: "tier is required" }, { status: 400 });
    }

    const normalizedAsset = normalizeNonEmptyString(asset) || "ETH";
    const normalizedChainId = parseChainId(chainId, 421614);
    if (!normalizedChainId) {
      return NextResponse.json({ error: "chainId must be a positive integer" }, { status: 400 });
    }

    const priceAmount = TIER_PRICING[tier];

    // Cancel existing active subscription
    await prisma.subscription.updateMany({
      where: { userId: user.id, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    // Debit for paid tiers
    if (BigInt(priceAmount) > BigInt(0)) {
      await debitWallet({
        userId: user.id,
        asset: normalizedAsset,
        amount: priceAmount,
        chainId: normalizedChainId,
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
        tier,
        status: "ACTIVE",
        priceAmount,
        asset: normalizedAsset,
        startDate: now,
        nextBillingDate: BigInt(priceAmount) > BigInt(0) ? nextBilling : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "SUBSCRIPTION_CREATED",
        meta: JSON.stringify({ subscriptionId: subscription.id, tier, priceAmount, asset: normalizedAsset }),
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
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.message.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { subscriptionId, action } = body as { subscriptionId?: unknown; action?: unknown };
    const normalizedSubscriptionId = normalizeNonEmptyString(subscriptionId);
    const normalizedAction = normalizeSubscriptionAction(action);

    if (!normalizedSubscriptionId || !normalizedAction) {
      return NextResponse.json(
        { error: "subscriptionId and valid action (cancel | pause | resume) are required" },
        { status: 400 }
      );
    }

    const sub = await prisma.subscription.findFirst({
      where: { id: normalizedSubscriptionId, userId: user.id },
    });

    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const updateData: { status?: SubscriptionStatus; cancelledAt?: Date } = {};
    switch (normalizedAction) {
      case "cancel":
        updateData.status = SubscriptionStatus.CANCELLED;
        updateData.cancelledAt = new Date();
        break;
      case "pause":
        updateData.status = SubscriptionStatus.PAUSED;
        break;
      case "resume":
        updateData.status = SubscriptionStatus.ACTIVE;
        break;
    }

    const updated = await prisma.subscription.update({
      where: { id: normalizedSubscriptionId },
      data: updateData,
    });

    return NextResponse.json({ subscription: updated });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
