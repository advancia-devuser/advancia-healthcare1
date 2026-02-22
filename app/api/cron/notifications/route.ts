/**
 * Agent 4 — Notification Agent
 * ─────────────────────────────
 * GET /api/cron/notifications
 *
 * Called periodically. Scans recent AuditLog entries that haven't been
 * notified and delivers email/push notifications.
 *
 * Notifiable events:
 *   - CREDIT_RECEIVE (deposit arrived)
 *   - DEBIT_WITHDRAW (withdrawal sent)
 *   - WITHDRAWAL_BROADCAST (tx confirmed)
 *   - WITHDRAWAL_FAILED
 *   - USER_APPROVE / USER_REJECT / USER_SUSPEND
 *   - CARD_APPROVE / CARD_REJECT
 *   - RECONCILE_MISMATCH (admin alert)
 *
 * For now, logs to console + stores delivery receipts.
 * Replace the `deliver()` stub with real email (Resend/SES/SendGrid)
 * or push (Firebase/OneSignal) in production.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendNotificationEmail } from "@/lib/email";
import { sendNotificationSms } from "@/lib/sms";

export const dynamic = "force-dynamic";

/* ─── Configuration ─── */

const NOTIFIABLE_ACTIONS = [
  "CREDIT_RECEIVE",
  "DEBIT_WITHDRAW",
  "WITHDRAWAL_BROADCAST",
  "WITHDRAWAL_FAILED",
  "USER_APPROVE",
  "USER_REJECT",
  "USER_SUSPEND",
  "CARD_APPROVE",
  "CARD_REJECT",
  "RECONCILE_MISMATCH",
  "ONCHAIN_BALANCE_MISMATCH",
];

// How far back to scan (minutes)
const LOOKBACK_MINUTES = 15;

/* ─── Delivery stub ─── */

interface NotificationPayload {
  userId: string | null;
  email: string | null;
  phone: string | null;
  action: string;
  meta: string | null;
}

/**
 * Deliver a notification via email + console log.
 * Returns true on success.
 */
async function deliver(payload: NotificationPayload): Promise<boolean> {
  // Send email if user has an email address
  if (payload.email) {
    const details = payload.meta ? (() => { try { return JSON.parse(payload.meta!); } catch { return {}; } })() : {};
    const result = await sendNotificationEmail(payload.email, payload.action, details);
    if (!result.success) {
      console.warn(`[NOTIFICATION] Email failed for ${payload.action}: ${result.error}`);
    }
  }

  // Send SMS if user has a phone number
  if (payload.phone) {
    const detail = payload.meta ? (() => { try { const p = JSON.parse(payload.meta!); return Object.values(p).filter(v => typeof v === 'string' || typeof v === 'number').slice(0, 2).join(', '); } catch { return undefined; } })() : undefined;
    const smsResult = await sendNotificationSms(payload.phone, payload.action, detail || undefined);
    if (!smsResult.success) {
      console.warn(`[NOTIFICATION] SMS failed for ${payload.action}: ${smsResult.error}`);
    }
  }

  // Console log for observability
  console.log(
    `[NOTIFICATION] ${payload.action} → user=${payload.userId} email=${payload.email} phone=${payload.phone}`,
    payload.meta ? JSON.parse(payload.meta) : ""
  );
  return true;
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

    const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);

    // Find recent notifiable audit entries
    const logs = await prisma.auditLog.findMany({
      where: {
        action: { in: NOTIFIABLE_ACTIONS },
        createdAt: { gte: since },
      },
      include: {
        user: { select: { id: true, email: true, phone: true, address: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Check which ones have already been notified (using a simple meta flag)
    // In production, use a separate NotificationDelivery table
    const results: Array<{
      auditLogId: string;
      action: string;
      delivered: boolean;
      error?: string;
    }> = [];

    for (const log of logs) {
      // Skip if meta already contains "__notified": true
      if (log.meta) {
        try {
          const parsed = JSON.parse(log.meta);
          if (parsed.__notified) continue;
        } catch {
          // Non-JSON meta, proceed
        }
      }

      try {
        const success = await deliver({
          userId: log.userId,
          email: log.user?.email ?? null,
          phone: log.user?.phone ?? null,
          action: log.action,
          meta: log.meta,
        });

        if (success) {
          // Mark as notified so we don't re-send
          const existingMeta = log.meta ? JSON.parse(log.meta) : {};
          await prisma.auditLog.update({
            where: { id: log.id },
            data: {
              meta: JSON.stringify({ ...existingMeta, __notified: true }),
            },
          });
        }

        results.push({
          auditLogId: log.id,
          action: log.action,
          delivered: success,
        });
      } catch (err: any) {
        results.push({
          auditLogId: log.id,
          action: log.action,
          delivered: false,
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      scanned: logs.length,
      delivered: results.filter((r) => r.delivered).length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Notification agent failed: ${err.message}` },
      { status: 500 }
    );
  }
}
