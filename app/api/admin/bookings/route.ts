import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

type AdminBookingAction = "CONFIRM" | "COMPLETE" | "CANCEL" | "NO_SHOW";

function isAdminBookingAction(value: unknown): value is AdminBookingAction {
  return value === "CONFIRM" || value === "COMPLETE" || value === "CANCEL" || value === "NO_SHOW";
}

/**
 * GET /api/admin/bookings — list all bookings
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { address: true, email: true, name: true } } },
    });

    const summary = {
      total: bookings.length,
      pending: bookings.filter((b) => b.status === "PENDING").length,
      confirmed: bookings.filter((b) => b.status === "CONFIRMED").length,
      completed: bookings.filter((b) => b.status === "COMPLETED").length,
      cancelled: bookings.filter((b) => b.status === "CANCELLED").length,
    };

    return NextResponse.json({ bookings, summary });
  } catch {
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/bookings — manage a booking
 * Body: { bookingId, action: "CONFIRM" | "COMPLETE" | "CANCEL" | "NO_SHOW" }
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { bookingId, action } = body as { bookingId?: unknown; action?: unknown };

    if (typeof bookingId !== "string" || !bookingId.trim()) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    if (!isAdminBookingAction(action)) {
      return NextResponse.json(
        { error: "Invalid action. Allowed values: CONFIRM, COMPLETE, CANCEL, NO_SHOW" },
        { status: 400 }
      );
    }

    const trimmedBookingId = bookingId.trim();
    const booking = await prisma.booking.findUnique({ where: { id: trimmedBookingId } });
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const updateData: {
      status?: "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
      completedAt?: Date;
      cancelledAt?: Date;
    } = {};

    switch (action) {
      case "CONFIRM":
        updateData.status = "CONFIRMED";
        break;
      case "COMPLETE":
        updateData.status = "COMPLETED";
        updateData.completedAt = new Date();
        break;
      case "CANCEL":
        updateData.status = "CANCELLED";
        updateData.cancelledAt = new Date();
        break;
      case "NO_SHOW":
        updateData.status = "NO_SHOW";
        break;
    }

    const updated = await prisma.booking.update({
      where: { id: trimmedBookingId },
      data: updateData,
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: booking.userId,
        title: `Booking ${action === "CONFIRM" ? "Confirmed" : action === "COMPLETE" ? "Completed" : action === "CANCEL" ? "Cancelled" : "No Show"}`,
        body: `Your ${booking.chamberName} booking on ${booking.date} at ${booking.timeSlot} has been ${action.toLowerCase()}ed by admin.`,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: booking.userId,
        actor: "ADMIN",
        action: `ADMIN_BOOKING_${action}`,
        meta: JSON.stringify({ bookingId: trimmedBookingId, action }),
      },
    });

    return NextResponse.json({ booking: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }
}
