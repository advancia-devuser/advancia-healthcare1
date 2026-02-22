import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/* ── Chamber Definitions ── */
const CHAMBERS = [
  { id: "alpha",  name: "Alpha Chamber",  type: "Standard Recovery",         pricePerHour: 150 },
  { id: "beta",   name: "Beta Chamber",   type: "Deep Tissue Regeneration",  pricePerHour: 250 },
  { id: "omega",  name: "Omega Chamber",  type: "Full Cellular Restoration", pricePerHour: 500 },
] as const;

const VALID_TIME_SLOTS = ["09:00 AM", "11:00 AM", "02:00 PM", "04:00 PM"];
const MAX_DURATION_HOURS = 4;

/**
 * GET /api/booking — list current user's bookings + chamber catalogue
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const bookings = await prisma.booking.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ bookings, chambers: CHAMBERS });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/booking — create a new medbed chamber booking
 * Body: {
 *   chamber: "alpha" | "beta" | "omega",
 *   date: "2025-01-15",
 *   timeSlot: "09:00 AM",
 *   duration?: number (hours, default 1, max 4),
 *   payWithWallet?: boolean (debit from crypto wallet)
 * }
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json().catch(() => ({}));

    const { chamber, date, timeSlot, duration = 1, payWithWallet = false } = body;

    // Validate chamber
    const chamberInfo = CHAMBERS.find((c) => c.id === chamber);
    if (!chamberInfo) {
      return NextResponse.json(
        { error: "Invalid chamber. Choose: alpha, beta, or omega" },
        { status: 400 }
      );
    }

    // Validate date
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Date is required in YYYY-MM-DD format" }, { status: 400 });
    }

    const bookingDate = new Date(date + "T00:00:00Z");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      return NextResponse.json({ error: "Cannot book a date in the past" }, { status: 400 });
    }

    // Validate time slot
    if (!VALID_TIME_SLOTS.includes(timeSlot)) {
      return NextResponse.json(
        { error: `Invalid time slot. Choose: ${VALID_TIME_SLOTS.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate duration (user passes hours, store as minutes)
    const durationHours = Math.min(MAX_DURATION_HOURS, Math.max(1, Math.floor(Number(duration))));
    if (isNaN(durationHours)) {
      return NextResponse.json({ error: "Duration must be a number of hours (1-4)" }, { status: 400 });
    }
    const durationMinutes = durationHours * 60;

    // Calculate price
    const priceUsd = chamberInfo.pricePerHour * durationHours;
    const priceUsdStr = priceUsd.toFixed(2);

    // Check availability (unique constraint: chamber + date + timeSlot)
    const existing = await prisma.booking.findFirst({
      where: {
        chamber,
        date,
        timeSlot,
        status: { notIn: ["CANCELLED"] },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: `${chamberInfo.name} is already booked at ${timeSlot} on ${date}` },
        { status: 409 }
      );
    }

    // Optional: debit wallet
    let txHash: string | undefined;
    let paidWithAsset: string | undefined;
    let paidAmount: string | undefined;

    if (payWithWallet) {
      // Import ledger helpers dynamically to keep this module small
      const { debitWallet } = await import("@/lib/ledger");
      const weiAmount = BigInt(Math.round(priceUsd * 1e18)).toString();

      try {
        const result = await debitWallet({
          userId: user.id,
          asset: "ETH",
          amount: weiAmount,
          chainId: 1,
          type: "SEND",
          meta: { purpose: "booking", chamber, date, timeSlot },
        });
        txHash = result.transactionId;
        paidWithAsset = "ETH";
        paidAmount = weiAmount;
      } catch {
        return NextResponse.json(
          { error: "Insufficient wallet balance for this booking" },
          { status: 402 }
        );
      }
    }

    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        chamber,
        chamberName: chamberInfo.name,
        date,
        timeSlot,
        duration: durationMinutes,
        priceUsd: priceUsdStr,
        status: payWithWallet ? "CONFIRMED" : "PENDING",
        paidWithAsset: paidWithAsset || null,
        paidAmount: paidAmount || null,
        txHash: txHash || null,
      },
    });

    // Audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "BOOKING_CREATED",
        meta: JSON.stringify({ chamber, date, timeSlot, priceUsd, durationHours }),
      },
    });

    // Notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Booking Confirmed",
        body: `${chamberInfo.name} booked for ${date} at ${timeSlot} (${durationHours}hr) — $${priceUsd}`,
      },
    });

    return NextResponse.json({ booking }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/booking — cancel a booking
 * Body: { bookingId: string }
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId required" }, { status: 400 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId: user.id },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.status === "CANCELLED" || booking.status === "COMPLETED") {
      return NextResponse.json({ error: "Booking cannot be cancelled" }, { status: 400 });
    }

    // Check if booking is at least 24 hours away
    const bookingDateTime = new Date(booking.date + "T00:00:00Z");
    const now = new Date();
    const hoursUntil = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil < 24) {
      return NextResponse.json(
        { error: "Bookings can only be cancelled at least 24 hours in advance" },
        { status: 400 }
      );
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
    });

    // Refund if paid with wallet
    if (booking.paidWithAsset && booking.paidAmount) {
      const { creditWallet } = await import("@/lib/ledger");
      await creditWallet({
        userId: user.id,
        asset: booking.paidWithAsset,
        amount: booking.paidAmount,
        chainId: 1,
        type: "RECEIVE",
        meta: { purpose: "booking_refund", bookingId },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "BOOKING_CANCELLED",
        meta: JSON.stringify({ bookingId }),
      },
    });

    return NextResponse.json({ booking: updated });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
