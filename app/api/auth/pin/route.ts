/**
 * PIN Setup & Verify API
 * ──────────────────────
 * POST /api/auth/pin
 * Actions: setup | verify | change
 *
 * PIN is a 6-digit code hashed with scrypt before storage.
 * Required for sensitive operations (transfers, withdrawals).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApprovedUser, checkRateLimitPersistent, getClientIP } from "@/lib/auth";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const SALT_LENGTH = 16;
const PIN_REGEX = /^\d{6}$/;

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizePin(value: unknown): string | null {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized || !PIN_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

function hashPin(pin: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(pin, salt, 64);
  return timingSafeEqual(derived, Buffer.from(hash, "hex"));
}

export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { action, pin, currentPin, newPin } = body as {
      action?: unknown;
      pin?: unknown;
      currentPin?: unknown;
      newPin?: unknown;
    };

    const normalizedAction = normalizeNonEmptyString(action);

    // Rate limit PIN attempts (5 per minute)
    const ip = getClientIP(request);
    if (!(await checkRateLimitPersistent(`pin:${user.id}:${ip}`, 5, 60_000))) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a minute." },
        { status: 429 }
      );
    }

    if (!normalizedAction) {
      return NextResponse.json(
        { error: "action is required (setup | verify | change)" },
        { status: 400 }
      );
    }

    /* ─── SETUP: Set initial PIN ─── */
    if (normalizedAction === "setup") {
      if (user.pin) {
        return NextResponse.json(
          { error: "PIN is already set. Use 'change' to update it." },
          { status: 400 }
        );
      }

      const normalizedPin = normalizePin(pin);
      if (!normalizedPin) {
        return NextResponse.json(
          { error: "PIN must be exactly 6 digits" },
          { status: 400 }
        );
      }

      const hashed = hashPin(normalizedPin);
      await prisma.user.update({
        where: { id: user.id },
        data: { pin: hashed },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          actor: user.address,
          action: "PIN_SET",
        },
      });

      await prisma.notification.create({
        data: {
          userId: user.id,
          title: "Transaction PIN Set",
          body: "Your 6-digit transaction PIN has been set successfully.",
          channel: "IN_APP",
        },
      });

      return NextResponse.json({ set: true, message: "PIN has been set." });
    }

    /* ─── VERIFY: Check a PIN ─── */
    if (normalizedAction === "verify") {
      if (!user.pin) {
        return NextResponse.json(
          { error: "No PIN set. Call setup first." },
          { status: 400 }
        );
      }

      const pinInput = normalizeNonEmptyString(pin);
      if (!pinInput) {
        return NextResponse.json(
          { error: "pin is required" },
          { status: 400 }
        );
      }

      const valid = verifyPin(pinInput, user.pin);

      if (!valid) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            actor: user.address,
            action: "PIN_VERIFY_FAILED",
            meta: JSON.stringify({ ip }),
          },
        });
        return NextResponse.json(
          { valid: false, error: "Incorrect PIN" },
          { status: 401 }
        );
      }

      return NextResponse.json({ valid: true });
    }

    /* ─── CHANGE: Update PIN ─── */
    if (normalizedAction === "change") {
      if (!user.pin) {
        return NextResponse.json(
          { error: "No PIN set. Use setup first." },
          { status: 400 }
        );
      }

      const currentPinInput = normalizeNonEmptyString(currentPin);
      const newPinInput = normalizePin(newPin);

      if (!currentPinInput || !newPinInput) {
        return NextResponse.json(
          { error: "currentPin and newPin are required and newPin must be exactly 6 digits" },
          { status: 400 }
        );
      }

      const valid = verifyPin(currentPinInput, user.pin);
      if (!valid) {
        return NextResponse.json(
          { error: "Current PIN is incorrect" },
          { status: 401 }
        );
      }

      const hashed = hashPin(newPinInput);
      await prisma.user.update({
        where: { id: user.id },
        data: { pin: hashed },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          actor: user.address,
          action: "PIN_CHANGED",
        },
      });

      return NextResponse.json({ changed: true, message: "PIN has been changed." });
    }

    return NextResponse.json(
      { error: "Invalid action. Use setup, verify, or change." },
      { status: 400 }
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("PIN error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
