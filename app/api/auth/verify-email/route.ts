/**
 * Email Verification API
 * ──────────────────────
 * POST /api/auth/verify-email
 * Actions: send | verify
 *
 * Generates a random token, stores it on the user record,
 * and verifies it when the user clicks the link or enters the code.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser, checkRateLimitPersistent, getClientIP } from "@/lib/auth";
import { randomBytes } from "crypto";
import { sendVerificationEmail } from "@/lib/email";

function normalizeNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { action, token } = body as {
      action?: unknown;
      token?: unknown;
    };
    const normalizedAction = normalizeNonEmptyString(action);

    // Rate limit (3 sends per 10 min, 5 verifies per min)
    const ip = getClientIP(request);

    if (!normalizedAction) {
      return NextResponse.json(
        { error: "action is required (send | verify)" },
        { status: 400 }
      );
    }

    /* ─── SEND: Generate verification token ─── */
    if (normalizedAction === "send") {
      if (!(await checkRateLimitPersistent(`email-send:${user.id}`, 3, 10 * 60_000))) {
        return NextResponse.json(
          { error: "Too many requests. Try again later." },
          { status: 429 }
        );
      }

      if (!user.email) {
        return NextResponse.json(
          { error: "No email address on file. Update your profile first." },
          { status: 400 }
        );
      }

      if (user.emailVerified) {
        return NextResponse.json(
          { error: "Email is already verified." },
          { status: 400 }
        );
      }

      // 8-char uppercase hex code (32-bit). Rate-limited to reduce brute-force risk.
      const verificationCode = randomBytes(4).toString("hex").toUpperCase();
      const expiry = new Date(Date.now() + 24 * 60 * 60_000); // 24 hours

      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationCode,
          emailVerificationExpiry: expiry,
        },
      });

      // In production, send this token via email (Resend, SendGrid, etc.)
      // For now, log it and return a masked response
      console.log(`[EMAIL VERIFICATION] User ${user.id}: Code = ${verificationCode}`);

      // Send the verification email
      await sendVerificationEmail(user.email, verificationCode);

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          actor: user.address,
          action: "EMAIL_VERIFICATION_SENT",
          meta: JSON.stringify({ email: user.email }),
        },
      });

      return NextResponse.json({
        sent: true,
        message: `Verification email sent to ${user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")}`,
        // Include token in dev mode for testing
        ...(process.env.NODE_ENV === "development" ? { devToken: verificationCode } : {}),
      });
    }

    /* ─── VERIFY: Confirm the token ─── */
    if (normalizedAction === "verify") {
      if (!(await checkRateLimitPersistent(`email-verify:${user.id}:${ip}`, 5, 60_000))) {
        return NextResponse.json(
          { error: "Too many attempts. Try again in a minute." },
          { status: 429 }
        );
      }

      if (user.emailVerified) {
        return NextResponse.json({ verified: true, message: "Email already verified." });
      }

      const providedCode = normalizeCode(token);
      if (!providedCode) {
        return NextResponse.json(
          { error: "token is required" },
          { status: 400 }
        );
      }

      const expectedCode = normalizeCode(user.emailVerificationToken);

      if (!expectedCode) {
        return NextResponse.json(
          { error: "No verification pending. Request a new code." },
          { status: 400 }
        );
      }

      if (
        user.emailVerificationExpiry &&
        new Date(user.emailVerificationExpiry) < new Date()
      ) {
        return NextResponse.json(
          { error: "Verification token expired. Request a new one." },
          { status: 400 }
        );
      }

      if (expectedCode !== providedCode) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            actor: user.address,
            action: "EMAIL_VERIFICATION_FAILED",
            meta: JSON.stringify({ ip }),
          },
        });
        return NextResponse.json(
          { error: "Invalid verification code" },
          { status: 400 }
        );
      }

      // Mark email as verified
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
          ...(user.status === "PENDING" ? { status: "APPROVED" } : {}),
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          actor: user.address,
          action: "EMAIL_VERIFIED",
          meta: JSON.stringify({ email: user.email }),
        },
      });

      await prisma.notification.create({
        data: {
          userId: user.id,
          title: "Email Verified",
          body: `Your email ${user.email} has been verified.`,
          channel: "IN_APP",
        },
      });

      return NextResponse.json({ verified: true, message: "Email verified successfully!" });
    }

    return NextResponse.json(
      { error: "Invalid action. Use send or verify." },
      { status: 400 }
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Email verification error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
