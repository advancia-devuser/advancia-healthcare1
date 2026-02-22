import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/bookings — list all bookings
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
}

/**
 * PATCH /api/admin/bookings — manage a booking
 * Body: { bookingId, action: "CONFIRM" | "COMPLETE" | "CANCEL" | "NO_SHOW" }
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { bookingId, action } = await request.json();

  if (!bookingId || !action) {
    return NextResponse.json({ error: "bookingId and action required" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const updateData: any = {};

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
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
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
      meta: JSON.stringify({ bookingId, action }),
    },
  });

  return NextResponse.json({ booking: updated });
}
