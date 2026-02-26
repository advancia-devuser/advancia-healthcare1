/**
 * Health Reminders API
 * ────────────────────
 * POST  /api/health/reminders → Set a reminder
 * GET   /api/health/reminders → List user reminders
 * PATCH /api/health/reminders → Mark completed or update
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApprovedUser } from "@/lib/auth";
import { HealthReminderStatus } from "@prisma/client";

const REMINDER_TYPES = new Set(["Appointment", "Medication", "PremiumDue"]);
const REMINDER_STATUSES = new Set<HealthReminderStatus>([
  HealthReminderStatus.PENDING,
  HealthReminderStatus.SENT,
  HealthReminderStatus.COMPLETED,
]);

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeReminderType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return REMINDER_TYPES.has(normalized) ? normalized : null;
}

function normalizeReminderStatus(value: unknown): HealthReminderStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return REMINDER_STATUSES.has(normalized as HealthReminderStatus)
    ? (normalized as HealthReminderStatus)
    : null;
}

function parseDateValue(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/* ─── GET — List user reminders ─── */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status"); // PENDING, SENT, COMPLETED
    const typeParam = searchParams.get("type"); // Appointment, Medication, PremiumDue
    const status = statusParam ? normalizeReminderStatus(statusParam) : null;
    const type = typeParam ? normalizeReminderType(typeParam) : null;

    if (statusParam && !status) {
      return NextResponse.json({ error: "status must be PENDING, SENT, or COMPLETED" }, { status: 400 });
    }

    if (typeParam && !type) {
      return NextResponse.json({ error: "type must be Appointment, Medication, or PremiumDue" }, { status: 400 });
    }

    const where: { userId: string; status?: HealthReminderStatus; type?: string } = { userId: user.id };
    if (status) where.status = status;
    if (type) where.type = type;

    const reminders = await prisma.healthReminder.findMany({
      where,
      orderBy: { remindAt: "asc" },
    });

    // Summary counts
    const counts = await prisma.healthReminder.groupBy({
      by: ["status"],
      where: { userId: user.id },
      _count: true,
    });

    const summary = {
      pending: 0,
      sent: 0,
      completed: 0,
    };
    for (const c of counts) {
      const key = c.status.toLowerCase() as keyof typeof summary;
      if (key in summary) summary[key] = c._count;
    }

    return NextResponse.json({ reminders, summary });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health reminders GET error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── POST — Create a new reminder ─── */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { type, message, remindAt } = body as {
      type?: unknown;
      message?: unknown;
      remindAt?: unknown;
    };

    const normalizedType = normalizeReminderType(type);
    const normalizedMessage = normalizeNonEmptyString(message);
    const remindAtDate = parseDateValue(remindAt);

    if (!normalizedType || !normalizedMessage || !remindAtDate) {
      return NextResponse.json(
        { error: "type, message, and remindAt are required" },
        { status: 400 }
      );
    }

    if (remindAtDate <= new Date()) {
      return NextResponse.json(
        { error: "remindAt must be in the future" },
        { status: 400 }
      );
    }

    const reminder = await prisma.healthReminder.create({
      data: {
        userId: user.id,
        type: normalizedType,
        message: normalizedMessage,
        remindAt: remindAtDate,
      },
    });

    // Create notification for the new reminder
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: `New ${normalizedType} Reminder Set`,
        body: `Reminder set for ${remindAtDate.toLocaleString()}: ${normalizedMessage}`,
        channel: "IN_APP",
        meta: JSON.stringify({ reminderId: reminder.id, type: normalizedType }),
      },
    });

    return NextResponse.json({ reminder });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health reminders POST error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── PATCH — Update or mark completed ─── */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { reminderId, status, message, remindAt } = body as {
      reminderId?: unknown;
      status?: unknown;
      message?: unknown;
      remindAt?: unknown;
    };

    const normalizedReminderId = normalizeNonEmptyString(reminderId);
    const normalizedStatus = status !== undefined ? normalizeReminderStatus(status) : undefined;
    const normalizedMessage = message !== undefined ? normalizeNonEmptyString(message) : undefined;
    const parsedRemindAt = remindAt !== undefined ? parseDateValue(remindAt) : undefined;

    if (!normalizedReminderId) {
      return NextResponse.json(
        { error: "reminderId is required" },
        { status: 400 }
      );
    }

    if (status !== undefined && normalizedStatus === null) {
      return NextResponse.json(
        { error: "Invalid status. Must be one of: PENDING, SENT, COMPLETED" },
        { status: 400 }
      );
    }

    if (message !== undefined && normalizedMessage === null) {
      return NextResponse.json({ error: "message cannot be empty" }, { status: 400 });
    }

    if (remindAt !== undefined && parsedRemindAt === null) {
      return NextResponse.json({ error: "Invalid remindAt date" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.healthReminder.findFirst({
      where: { id: normalizedReminderId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 }
      );
    }

    const updateData: {
      status?: HealthReminderStatus;
      message?: string;
      remindAt?: Date;
    } = {};

    if (normalizedStatus !== undefined && normalizedStatus !== null) {
      updateData.status = normalizedStatus;
    }
    if (normalizedMessage !== undefined && normalizedMessage !== null) {
      updateData.message = normalizedMessage;
    }
    if (parsedRemindAt !== undefined && parsedRemindAt !== null) {
      updateData.remindAt = parsedRemindAt;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "At least one updatable field (status, message, remindAt) is required" },
        { status: 400 }
      );
    }

    const updated = await prisma.healthReminder.update({
      where: { id: normalizedReminderId },
      data: updateData,
    });

    return NextResponse.json({ reminder: updated });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health reminders PATCH error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── DELETE — Remove a reminder ─── */
export async function DELETE(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const { searchParams } = new URL(request.url);
    const reminderId = normalizeNonEmptyString(searchParams.get("reminderId"));

    if (!reminderId) {
      return NextResponse.json(
        { error: "reminderId is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.healthReminder.findFirst({
      where: { id: reminderId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 }
      );
    }

    await prisma.healthReminder.delete({ where: { id: reminderId } });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Health reminders DELETE error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
