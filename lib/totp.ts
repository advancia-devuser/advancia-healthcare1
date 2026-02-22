/**
 * TOTP (Time-based One-Time Password) Utility
 * ─────────────────────────────────────────────
 * Implements RFC 6238 TOTP for 2FA.
 * Uses Node.js crypto — no external dependencies.
 */

import { createHmac, randomBytes } from "crypto";

const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "sha1";

/**
 * Generate a random base32-encoded secret for TOTP.
 */
export function generateTotpSecret(): string {
  const buffer = randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Generate the current TOTP code from a secret.
 */
export function generateTotpCode(secret: string, time?: number): string {
  const now = time ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / TOTP_PERIOD);
  return hmacOtp(base32Decode(secret), counter);
}

/**
 * Verify a TOTP code against a secret.
 * Allows ±1 time step (30s window on each side) for clock drift.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const secretBytes = base32Decode(secret);

  for (let drift = -1; drift <= 1; drift++) {
    const counter = Math.floor(now / TOTP_PERIOD) + drift;
    const expected = hmacOtp(secretBytes, counter);
    if (timingSafeEqual(expected, code)) {
      return true;
    }
  }
  return false;
}

/**
 * Generate an otpauth:// URI for authenticator apps.
 */
export function generateTotpUri(secret: string, email: string, issuer: string = "SmartWallet"): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/* ─── Internal Helpers ─── */

function hmacOtp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // Write counter as big-endian 64-bit
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);

  const hmac = createHmac(TOTP_ALGORITHM, secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, "0");
}

/** Constant-time string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/* ─── Base32 Encoding/Decoding ─── */

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleaned) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
