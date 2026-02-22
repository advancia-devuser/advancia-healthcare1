/**
 * OTP Authentication API — Advancia Healthcare
 * ──────────────────────────────────────────────
 * POST /api/auth/otp          → Send OTP to phone
 * PATCH /api/auth/otp         → Verify OTP code
 * DELETE /api/auth/otp        → Cleanup expired OTPs (admin/cron)
 */

import { NextRequest, NextResponse } from "next/server";
import { sendOtp, verifyOtp, cleanupExpiredOtps, type OtpPurpose } from "@/lib/esim-otp";
import { prisma } from "@/lib/db";

/* ─── POST: Send OTP ─── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, purpose = "LOGIN" } = body as {
      phone: string;
      purpose?: OtpPurpose;
    };

    if (!phone) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    const result = await sendOtp(phone, purpose);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 429 });
    }

    return NextResponse.json({
      success: true,
      maskedPhone: result.maskedPhone,
      expiresAt: result.expiresAt?.toISOString(),
      message: `OTP sent to ${result.maskedPhone}`,
    });
  } catch (err: any) {
    console.error("[OTP SEND ERROR]", err);
    return NextResponse.json(
      { error: "Failed to send OTP" },
      { status: 500 }
    );
  }
}

/* ─── PATCH: Verify OTP ─── */

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, code, purpose = "LOGIN" } = body as {
      phone: string;
      code: string;
      purpose?: OtpPurpose;
    };

    if (!phone || !code) {
      return NextResponse.json(
        { error: "Phone and code are required" },
        { status: 400 }
      );
    }

    const result = await verifyOtp(phone, code, purpose);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // For LOGIN purpose: find or link the user by phone
    if (purpose === "LOGIN") {
      // Try to find a user with this phone in their profile
      const user = await prisma.user.findFirst({
        where: { phone },
        select: { id: true, address: true, email: true, name: true, phone: true },
      });

      return NextResponse.json({
        success: true,
        verified: true,
        phone: result.phone,
        user: user || null,
        message: user
          ? "OTP verified. User found."
          : "OTP verified. No account linked to this phone number yet.",
      });
    }

    return NextResponse.json({
      success: true,
      verified: true,
      phone: result.phone,
      message: "OTP verified successfully.",
    });
  } catch (err: any) {
    console.error("[OTP VERIFY ERROR]", err);
    return NextResponse.json(
      { error: "Failed to verify OTP" },
      { status: 500 }
    );
  }
}

/* ─── DELETE: Cleanup expired OTPs (admin/cron) ─── */

export async function DELETE() {
  try {
    const deleted = await cleanupExpiredOtps();
    return NextResponse.json({
      success: true,
      deleted,
      message: `Cleaned up ${deleted} expired OTP records`,
    });
  } catch (err: any) {
    console.error("[OTP CLEANUP ERROR]", err);
    return NextResponse.json(
      { error: "Failed to cleanup OTPs" },
      { status: 500 }
    );
  }
}
