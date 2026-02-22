/**
 * Admin 2FA Setup
 * ───────────────
 * POST /api/admin/2fa
 * Actions: setup | verify | disable | status
 *
 * Requires an active admin session (cookie check).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminRequest } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";
import { generateTotpSecret, verifyTotpCode, generateTotpUri } from "@/lib/totp";

export async function POST(request: Request) {
  const isAdmin = await isAdminRequest();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action, code } = await request.json();

    if (!action) {
      return NextResponse.json(
        { error: "action is required (setup | verify | disable | status)" },
        { status: 400 }
      );
    }

    /* ─── STATUS: Check if 2FA is enabled ─── */
    if (action === "status") {
      const config = await prisma.adminConfig.findUnique({
        where: { key: "admin_totp_secret" },
      });
      return NextResponse.json({ enabled: !!config?.value });
    }

    /* ─── SETUP: Generate new TOTP secret ─── */
    if (action === "setup") {
      const existing = await prisma.adminConfig.findUnique({
        where: { key: "admin_totp_secret" },
      });
      if (existing?.value) {
        return NextResponse.json(
          { error: "2FA is already enabled. Disable it first." },
          { status: 400 }
        );
      }

      const secret = generateTotpSecret();

      // Store temporarily unencrypted until verified, then encrypt on verify
      await prisma.adminConfig.upsert({
        where: { key: "admin_totp_pending" },
        create: { key: "admin_totp_pending", value: secret },
        update: { value: secret },
      });

      const uri = generateTotpUri(secret, "admin@smartwallet.app", "SmartWallet Admin");

      return NextResponse.json({
        secret,
        uri,
        message: "Scan the QR code in your authenticator app, then verify with a code.",
      });
    }

    /* ─── VERIFY: Confirm and enable 2FA ─── */
    if (action === "verify") {
      if (!code || typeof code !== "string" || code.length !== 6) {
        return NextResponse.json(
          { error: "A 6-digit code is required" },
          { status: 400 }
        );
      }

      const pending = await prisma.adminConfig.findUnique({
        where: { key: "admin_totp_pending" },
      });

      if (!pending?.value) {
        return NextResponse.json(
          { error: "No pending 2FA setup. Call setup first." },
          { status: 400 }
        );
      }

      const valid = verifyTotpCode(pending.value, code);
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 400 }
        );
      }

      // Encrypt the secret and store permanently
      const encryptedSecret = encrypt(pending.value);
      await prisma.adminConfig.upsert({
        where: { key: "admin_totp_secret" },
        create: { key: "admin_totp_secret", value: encryptedSecret },
        update: { value: encryptedSecret },
      });

      // Remove the pending secret
      await prisma.adminConfig.delete({
        where: { key: "admin_totp_pending" },
      });

      return NextResponse.json({ enabled: true, message: "Admin 2FA is now active." });
    }

    /* ─── DISABLE: Turn off 2FA ─── */
    if (action === "disable") {
      if (!code || typeof code !== "string" || code.length !== 6) {
        return NextResponse.json(
          { error: "A 6-digit code is required to disable 2FA" },
          { status: 400 }
        );
      }

      const config = await prisma.adminConfig.findUnique({
        where: { key: "admin_totp_secret" },
      });

      if (!config?.value) {
        return NextResponse.json(
          { error: "2FA is not enabled" },
          { status: 400 }
        );
      }

      const secret = decrypt(config.value);
      const valid = verifyTotpCode(secret, code);
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 400 }
        );
      }

      await prisma.adminConfig.delete({
        where: { key: "admin_totp_secret" },
      });

      return NextResponse.json({ enabled: false, message: "Admin 2FA has been disabled." });
    }

    return NextResponse.json(
      { error: "Invalid action. Use setup, verify, disable, or status." },
      { status: 400 }
    );
  } catch (e) {
    console.error("Admin 2FA error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
