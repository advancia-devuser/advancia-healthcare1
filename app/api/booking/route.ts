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

type ChamberId = (typeof CHAMBERS)[number]["id"];

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value === true;
}

function normalizeChamber(value: unknown): ChamberId | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return CHAMBERS.some((c) => c.id === normalized) ? (normalized as ChamberId) : null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeTimeSlot(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return VALID_TIME_SLOTS.includes(normalized) ? normalized : null;
}

function parseDurationHours(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? Math.floor(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(MAX_DURATION_HOURS, Math.max(1, parsed));
}

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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { chamber, date, timeSlot, duration, payWithWallet } = body as {
      chamber?: unknown;
      date?: unknown;
      timeSlot?: unknown;
      duration?: unknown;
      payWithWallet?: unknown;
    };

    const normalizedChamber = normalizeChamber(chamber);
    const normalizedDate = normalizeDate(date);
    const normalizedTimeSlot = normalizeTimeSlot(timeSlot);
    const durationHours = parseDurationHours(duration, 1);
    const shouldPayWithWallet = normalizeBoolean(payWithWallet, false);

    // Validate chamber
    const chamberInfo = CHAMBERS.find((c) => c.id === normalizedChamber);
    if (!chamberInfo) {
      return NextResponse.json(
        { error: "Invalid chamber. Choose: alpha, beta, or omega" },
        { status: 400 }
      );
    }

    // Validate date
    if (!normalizedDate) {
      return NextResponse.json({ error: "Date is required in YYYY-MM-DD format" }, { status: 400 });
    }

    const bookingDate = new Date(normalizedDate + "T00:00:00Z");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      return NextResponse.json({ error: "Cannot book a date in the past" }, { status: 400 });
    }

    // Validate time slot
    if (!normalizedTimeSlot) {
      return NextResponse.json(
        { error: `Invalid time slot. Choose: ${VALID_TIME_SLOTS.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate duration (user passes hours, store as minutes)
    if (!durationHours) {
      return NextResponse.json({ error: "Duration must be a number of hours (1-4)" }, { status: 400 });
    }
    const durationMinutes = durationHours * 60;

    // Calculate price
    const priceUsd = chamberInfo.pricePerHour * durationHours;
    const priceUsdStr = priceUsd.toFixed(2);

    // Check availability (unique constraint: chamber + date + timeSlot)
    const existing = await prisma.booking.findFirst({
      where: {
        chamber: chamberInfo.id,
        date: normalizedDate,
        timeSlot: normalizedTimeSlot,
        status: { notIn: ["CANCELLED"] },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: `${chamberInfo.name} is already booked at ${normalizedTimeSlot} on ${normalizedDate}` },
        { status: 409 }
      );
    }

    // Optional: debit wallet
    let txHash: string | undefined;
    let paidWithAsset: string | undefined;
    let paidAmount: string | undefined;

    if (shouldPayWithWallet) {
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
          meta: { purpose: "booking", chamber: chamberInfo.id, date: normalizedDate, timeSlot: normalizedTimeSlot },
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
        chamber: chamberInfo.id,
        chamberName: chamberInfo.name,
        date: normalizedDate,
        timeSlot: normalizedTimeSlot,
        duration: durationMinutes,
        priceUsd: priceUsdStr,
        status: shouldPayWithWallet ? "CONFIRMED" : "PENDING",
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
        meta: JSON.stringify({ chamber: chamberInfo.id, date: normalizedDate, timeSlot: normalizedTimeSlot, priceUsd, durationHours }),
      },
    });

    // Notification
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Booking Confirmed",
        body: `${chamberInfo.name} booked for ${normalizedDate} at ${normalizedTimeSlot} (${durationHours}hr) — $${priceUsd}`,
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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { bookingId } = body as { bookingId?: unknown };
    const normalizedBookingId = normalizeNonEmptyString(bookingId);

    if (!normalizedBookingId) {
      return NextResponse.json({ error: "bookingId required" }, { status: 400 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: normalizedBookingId, userId: user.id },
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
      where: { id: normalizedBookingId },
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
        meta: { purpose: "booking_refund", bookingId: normalizedBookingId },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "BOOKING_CANCELLED",
        meta: JSON.stringify({ bookingId: normalizedBookingId }),
      },
    });

    return NextResponse.json({ booking: updated });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
