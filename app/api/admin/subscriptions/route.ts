import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SubscriptionStatus, SubscriptionTier } from "@prisma/client";

type AdminSubscriptionAction = "CANCEL" | "PAUSE" | "RESUME" | "UPGRADE";

const SUBSCRIPTION_TIER_VALUES = new Set<SubscriptionTier>([
  SubscriptionTier.FREE,
  SubscriptionTier.BASIC,
  SubscriptionTier.PREMIUM,
  SubscriptionTier.ENTERPRISE,
]);

function isAdminSubscriptionAction(value: unknown): value is AdminSubscriptionAction {
  return value === "CANCEL" || value === "PAUSE" || value === "RESUME" || value === "UPGRADE";
}

function isSubscriptionTier(value: unknown): value is SubscriptionTier {
  return typeof value === "string" && SUBSCRIPTION_TIER_VALUES.has(value as SubscriptionTier);
}

/**
 * GET /api/admin/subscriptions — list all subscriptions
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const subscriptions = await prisma.subscription.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { address: true, email: true, name: true } } },
    });

    const summary = {
      total: subscriptions.length,
      active: subscriptions.filter((s) => s.status === "ACTIVE").length,
      byTier: {
        FREE: subscriptions.filter((s) => s.tier === "FREE" && s.status === "ACTIVE").length,
        BASIC: subscriptions.filter((s) => s.tier === "BASIC" && s.status === "ACTIVE").length,
        PREMIUM: subscriptions.filter((s) => s.tier === "PREMIUM" && s.status === "ACTIVE").length,
        ENTERPRISE: subscriptions.filter((s) => s.tier === "ENTERPRISE" && s.status === "ACTIVE").length,
      },
    };

    return NextResponse.json({ subscriptions, summary });
  } catch {
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/subscriptions — manage a user's subscription
 * Body: { subscriptionId, action: "CANCEL" | "PAUSE" | "RESUME" | "UPGRADE", tier? }
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { subscriptionId, action, tier } = body as {
      subscriptionId?: unknown;
      action?: unknown;
      tier?: unknown;
    };

    if (typeof subscriptionId !== "string" || !subscriptionId.trim()) {
      return NextResponse.json({ error: "subscriptionId is required" }, { status: 400 });
    }

    if (!isAdminSubscriptionAction(action)) {
      return NextResponse.json(
        { error: "Invalid action. Allowed values: CANCEL, PAUSE, RESUME, UPGRADE" },
        { status: 400 }
      );
    }

    const trimmedSubscriptionId = subscriptionId.trim();
    const sub = await prisma.subscription.findUnique({ where: { id: trimmedSubscriptionId } });
    if (!sub) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    const updateData: {
      status?: SubscriptionStatus;
      cancelledAt?: Date;
      tier?: SubscriptionTier;
    } = {};

    switch (action) {
      case "CANCEL":
        updateData.status = SubscriptionStatus.CANCELLED;
        updateData.cancelledAt = new Date();
        break;
      case "PAUSE":
        updateData.status = SubscriptionStatus.PAUSED;
        break;
      case "RESUME":
        updateData.status = SubscriptionStatus.ACTIVE;
        break;
      case "UPGRADE":
        if (!isSubscriptionTier(tier)) {
          return NextResponse.json(
            { error: "tier is required for UPGRADE and must be one of FREE, BASIC, PREMIUM, ENTERPRISE" },
            { status: 400 }
          );
        }
        updateData.tier = tier;
        break;
    }

    const updated = await prisma.subscription.update({
      where: { id: trimmedSubscriptionId },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: sub.userId,
        actor: "ADMIN",
        action: `ADMIN_SUBSCRIPTION_${action}`,
        meta: JSON.stringify({ subscriptionId: trimmedSubscriptionId, action, tier }),
      },
    });

    return NextResponse.json({ subscription: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }
}
