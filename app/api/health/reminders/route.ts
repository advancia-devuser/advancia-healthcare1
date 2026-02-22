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

/* ─── GET — List user reminders ─── */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // PENDING, SENT, COMPLETED
    const type = searchParams.get("type"); // Appointment, Medication, PremiumDue

    const where: Record<string, unknown> = { userId: user.id };
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
    const body = await request.json();

    const { type, message, remindAt } = body;

    if (!type || !message || !remindAt) {
      return NextResponse.json(
        { error: "type, message, and remindAt are required" },
        { status: 400 }
      );
    }

    const validTypes = ["Appointment", "Medication", "PremiumDue"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const remindAtDate = new Date(remindAt);
    if (isNaN(remindAtDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid remindAt date" },
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
        type,
        message,
        remindAt: remindAtDate,
      },
    });

    // Create notification for the new reminder
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: `New ${type} Reminder Set`,
        body: `Reminder set for ${remindAtDate.toLocaleString()}: ${message}`,
        channel: "IN_APP",
        meta: JSON.stringify({ reminderId: reminder.id, type }),
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
    const body = await request.json();

    const { reminderId, status, message, remindAt } = body;

    if (!reminderId) {
      return NextResponse.json(
        { error: "reminderId is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await prisma.healthReminder.findFirst({
      where: { id: reminderId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Reminder not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (status) {
      const validStatuses = ["PENDING", "SENT", "COMPLETED"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }
    if (message) updateData.message = message;
    if (remindAt) {
      const remindAtDate = new Date(remindAt);
      if (isNaN(remindAtDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid remindAt date" },
          { status: 400 }
        );
      }
      updateData.remindAt = remindAtDate;
    }

    const updated = await prisma.healthReminder.update({
      where: { id: reminderId },
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
    const reminderId = searchParams.get("reminderId");

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
