import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/subscriptions — list all subscriptions
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
}

/**
 * PATCH /api/admin/subscriptions — manage a user's subscription
 * Body: { subscriptionId, action: "CANCEL" | "PAUSE" | "RESUME" | "UPGRADE", tier? }
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { subscriptionId, action, tier } = await request.json();

  if (!subscriptionId || !action) {
    return NextResponse.json({ error: "subscriptionId and action required" }, { status: 400 });
  }

  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const updateData: any = {};

  switch (action) {
    case "CANCEL":
      updateData.status = "CANCELLED";
      updateData.cancelledAt = new Date();
      break;
    case "PAUSE":
      updateData.status = "PAUSED";
      break;
    case "RESUME":
      updateData.status = "ACTIVE";
      break;
    case "UPGRADE":
      if (!tier) return NextResponse.json({ error: "tier required for UPGRADE" }, { status: 400 });
      updateData.tier = tier;
      break;
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: updateData,
  });

  await prisma.auditLog.create({
    data: {
      userId: sub.userId,
      actor: "ADMIN",
      action: `ADMIN_SUBSCRIPTION_${action}`,
      meta: JSON.stringify({ subscriptionId, action, tier }),
    },
  });

  return NextResponse.json({ subscription: updated });
}
