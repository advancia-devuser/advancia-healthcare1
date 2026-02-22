/**
 * Health Card Expiry Checker (Cron)
 * ──────────────────────────────────
 * Daily job that checks for health cards approaching expiry
 * or already expired. Updates status and notifies users.
 *
 * Trigger: GET /api/cron/health-expiry
 * Recommended schedule: Once daily
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    checked: 0,
    expiringSoon: 0,
    expired: 0,
    errors: 0,
  };

  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60_000);

    // 1) Mark already-expired cards
    const expiredCards = await prisma.healthCard.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lte: now, not: null },
      },
      include: {
        user: {
          select: { id: true, address: true },
        },
      },
    });

    for (const card of expiredCards) {
      try {
        await prisma.healthCard.update({
          where: { id: card.id },
          data: { status: "EXPIRED" },
        });

        await prisma.notification.create({
          data: {
            userId: card.userId,
            title: "Health Card Expired",
            body: `Your ${card.cardType.toLowerCase()} card from ${card.providerName} has expired. Please update it.`,
            channel: "IN_APP",
            meta: JSON.stringify({
              cardId: card.id,
              providerName: card.providerName,
              cardType: card.cardType,
            }),
          },
        });

        // Audit log
        await prisma.auditLog.create({
          data: {
            userId: card.userId,
            actor: "SYSTEM",
            action: "HEALTH_CARD_EXPIRED",
            meta: JSON.stringify({
              cardId: card.id,
              providerName: card.providerName,
              expiresAt: card.expiresAt,
            }),
          },
        });

        results.expired++;
      } catch (err) {
        console.error(`Failed to process expired card ${card.id}:`, err);
        results.errors++;
      }
    }

    // 2) Warn about cards expiring within 30 days
    const expiringCards = await prisma.healthCard.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: {
          gt: now,
          lte: thirtyDaysFromNow,
        },
      },
      include: {
        user: {
          select: { id: true, address: true },
        },
      },
    });

    for (const card of expiringCards) {
      try {
        // Check if we already sent a warning notification today
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const existingNotification = await prisma.notification.findFirst({
          where: {
            userId: card.userId,
            title: "Health Card Expiring Soon",
            createdAt: { gte: todayStart },
            meta: { contains: card.id },
          },
        });

        if (existingNotification) continue; // Already notified today

        const daysUntilExpiry = Math.ceil(
          ((card.expiresAt as Date).getTime() - now.getTime()) / (24 * 60 * 60_000)
        );

        await prisma.notification.create({
          data: {
            userId: card.userId,
            title: "Health Card Expiring Soon",
            body: `Your ${card.cardType.toLowerCase()} card from ${card.providerName} expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}. Please renew it.`,
            channel: "IN_APP",
            meta: JSON.stringify({
              cardId: card.id,
              providerName: card.providerName,
              cardType: card.cardType,
              daysUntilExpiry,
            }),
          },
        });

        results.expiringSoon++;
      } catch (err) {
        console.error(`Failed to process expiring card ${card.id}:`, err);
        results.errors++;
      }
    }

    results.checked = expiredCards.length + expiringCards.length;

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (e) {
    console.error("Health card expiry checker error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", ...results },
      { status: 500 }
    );
  }
}
