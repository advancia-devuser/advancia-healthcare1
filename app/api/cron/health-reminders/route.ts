/**
 * Health Reminder Agent (Cron)
 * ────────────────────────────
 * Runs periodically. Finds PENDING health reminders whose `remindAt`
 * time has arrived, creates in-app notifications, and marks them SENT.
 *
 * Trigger: GET /api/cron/health-reminders
 * Recommended schedule: Every 5 minutes
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendHealthReminderEmail } from "@/lib/email";
import { sendHealthReminderSms } from "@/lib/sms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { processed: 0, sent: 0, errors: 0 };

  try {
    const now = new Date();

    // Find all PENDING reminders whose time has arrived
    const dueReminders = await prisma.healthReminder.findMany({
      where: {
        status: "PENDING",
        remindAt: { lte: now },
      },
      include: {
        user: {
          select: { id: true, address: true, email: true, phone: true },
        },
      },
    });

    results.processed = dueReminders.length;

    for (const reminder of dueReminders) {
      try {
        // Create in-app notification
        await prisma.notification.create({
          data: {
            userId: reminder.userId,
            title: `Health Reminder: ${reminder.type}`,
            body: reminder.message,
            channel: "IN_APP",
            meta: JSON.stringify({
              reminderId: reminder.id,
              type: reminder.type,
            }),
          },
        });

        // Mark reminder as SENT
        await prisma.healthReminder.update({
          where: { id: reminder.id },
          data: { status: "SENT" },
        });

        // Send email if user has one
        if (reminder.user?.email) {
          sendHealthReminderEmail(
            reminder.user.email,
            `Health Reminder: ${reminder.type}`,
            reminder.message
          ).catch((err) => console.error("[EMAIL] Health reminder email failed:", err));
        }

        // Send SMS if user has a phone number
        if (reminder.user?.phone) {
          sendHealthReminderSms(
            reminder.user.phone,
            reminder.type,
            reminder.message
          ).catch((err) => console.error("[SMS] Health reminder SMS failed:", err));
        }

        results.sent++;
      } catch (err) {
        console.error(`Failed to process reminder ${reminder.id}:`, err);
        results.errors++;
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      ...results,
    });
  } catch (e) {
    console.error("Health reminder agent error:", e);
    return NextResponse.json(
      { ok: false, error: "Internal error", ...results },
      { status: 500 }
    );
  }
}
