/**
 * PIN Verification Helper
 * ───────────────────────
 * Shared utility for verifying user PINs on sensitive operations.
 * Returns null if PIN is valid, or a NextResponse error if not.
 */

import { NextResponse } from "next/server";
import { scryptSync, timingSafeEqual } from "crypto";

interface UserWithPin {
  id: string;
  pin: string | null;
}

function verifyPinHash(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(pin, salt, 64);
  return timingSafeEqual(derived, Buffer.from(hash, "hex"));
}

/**
 * Verify a user's PIN for sensitive operations.
 * @returns null if OK, or a NextResponse error to return immediately.
 */
export async function verifyUserPin(
  user: UserWithPin,
  pin: string | undefined | null
): Promise<NextResponse | null> {
  // If user hasn't set a PIN, skip verification (but warn)
  if (!user.pin) {
    return null; // No PIN set — allow (PIN setup is encouraged, not blocking)
  }

  if (!pin || typeof pin !== "string") {
    return NextResponse.json(
      { error: "PIN is required for this operation" },
      { status: 403 }
    );
  }

  if (!verifyPinHash(pin, user.pin)) {
    return NextResponse.json(
      { error: "Incorrect PIN" },
      { status: 401 }
    );
  }

  return null; // PIN verified successfully
}
