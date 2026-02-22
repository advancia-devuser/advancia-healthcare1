/**
 * 2FA Setup & Verify API (TOTP)
 * ──────────────────────────────
 * POST /api/auth/2fa/setup   → Generate new TOTP secret + QR URI
 * POST /api/auth/2fa/verify  → Verify TOTP code and enable 2FA
 * POST /api/auth/2fa/disable → Disable 2FA with code verification
 *
 * Uses the /setup and /verify and /disable actions via `action` body param.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApprovedUser } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";
import { generateTotpSecret, verifyTotpCode, generateTotpUri } from "@/lib/totp";

export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();
    const { action, code } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required (setup | verify | disable)" },
        { status: 400 }
      );
    }

    /* ─── SETUP: Generate secret ─── */
    if (action === "setup") {
      if (user.twoFaEnabled) {
        return NextResponse.json(
          { error: "2FA is already enabled. Disable it first." },
          { status: 400 }
        );
      }

      const secret = generateTotpSecret();
      const encryptedSecret = encrypt(secret);

      // Store the encrypted secret (not yet enabled)
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFaSecret: encryptedSecret },
      });

      const uri = generateTotpUri(
        secret,
        user.email || user.address,
        "SmartWallet"
      );

      return NextResponse.json({
        secret,     // Show to user so they can manually enter it
        uri,        // QR code URI (otpauth://)
        message: "Scan the QR code in your authenticator app, then verify with a code.",
      });
    }

    /* ─── VERIFY: Enable 2FA ─── */
    if (action === "verify") {
      if (!code || typeof code !== "string" || code.length !== 6) {
        return NextResponse.json(
          { error: "A 6-digit code is required" },
          { status: 400 }
        );
      }

      if (!user.twoFaSecret) {
        return NextResponse.json(
          { error: "No 2FA secret found. Call setup first." },
          { status: 400 }
        );
      }

      const secret = decrypt(user.twoFaSecret);
      const valid = verifyTotpCode(secret, code);

      if (!valid) {
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 400 }
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { twoFaEnabled: true },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          actor: user.address,
          action: "2FA_ENABLED",
        },
      });

      await prisma.notification.create({
        data: {
          userId: user.id,
          title: "2FA Enabled",
          body: "Two-factor authentication has been enabled on your account.",
          channel: "IN_APP",
        },
      });

      return NextResponse.json({ enabled: true, message: "2FA is now active." });
    }

    /* ─── DISABLE: Turn off 2FA ─── */
    if (action === "disable") {
      if (!user.twoFaEnabled) {
        return NextResponse.json(
          { error: "2FA is not enabled" },
          { status: 400 }
        );
      }

      if (!code || typeof code !== "string" || code.length !== 6) {
        return NextResponse.json(
          { error: "A 6-digit code is required to disable 2FA" },
          { status: 400 }
        );
      }

      const secret = decrypt(user.twoFaSecret!);
      const valid = verifyTotpCode(secret, code);

      if (!valid) {
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 400 }
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { twoFaEnabled: false, twoFaSecret: null },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          actor: user.address,
          action: "2FA_DISABLED",
        },
      });

      return NextResponse.json({ enabled: false, message: "2FA has been disabled." });
    }

    return NextResponse.json(
      { error: "Invalid action. Use setup, verify, or disable." },
      { status: 400 }
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("2FA error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
