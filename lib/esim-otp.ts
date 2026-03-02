/**
 * eSIM OTP Service — Advancia Healthcare
 * ───────────────────────────────────────
 * Manages OTP generation, delivery (via Twilio SMS or SMS Pool eSIM),
 * and verification using the OtpVerification Prisma model.
 *
 * Environment variables:
 *   TWILIO_ACCOUNT_SID   — Twilio Account SID (primary channel)
 *   TWILIO_AUTH_TOKEN     — Twilio Auth Token
 *   TWILIO_PHONE_NUMBER   — Twilio FROM number
 *   SMSPOOL_API_KEY       — SMS Pool API key (eSIM fallback channel)
 *   OTP_EXPIRY_MINUTES    — OTP validity in minutes (default: 5)
 *   OTP_MAX_ATTEMPTS      — Max wrong attempts before lockout (default: 5)
 */

import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/sms";
import { logger } from "@/lib/logger";

/* ─── Config ─── */

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || "5", 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);
const SMSPOOL_API_KEY = process.env.SMSPOOL_API_KEY || "";

/* ─── Types ─── */

export type OtpPurpose = "LOGIN" | "TX_CONFIRM" | "2FA_SETUP";

export interface OtpSendResult {
  success: boolean;
  expiresAt?: Date;
  error?: string;
  /** masked phone for display, e.g. "+1***456" */
  maskedPhone?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  error?: string;
  /** If login OTP, the phone number tied to the verified record */
  phone?: string;
}

/* ─── Helpers ─── */

/** Generate a cryptographically-influenced N-digit numeric code */
function generateCode(length = 6): string {
  let code = "";
  const arr = new Uint32Array(length);
  // Use Web Crypto if available, else Math.random fallback
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(arr);
    for (let i = 0; i < length; i++) code += (arr[i] % 10).toString();
  } else {
    for (let i = 0; i < length; i++) code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

/** Mask a phone number for display: +1234567890 → +12***7890 */
function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone.slice(0, 2) + "***";
  return phone.slice(0, 3) + "***" + phone.slice(-4);
}

/* ─── SMS Pool eSIM fallback channel ─── */

async function sendViaSmsPool(phone: string, body: string): Promise<boolean> {
  if (!SMSPOOL_API_KEY) return false;

  try {
    const res = await fetch("https://api.smspool.net/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: SMSPOOL_API_KEY,
        number: phone.replace("+", ""),
        message: body,
      }),
    });

    if (!res.ok) {
      logger.error("SMS Pool error", { err: await res.text() });
      return false;
    }

    const data = await res.json();
    return data.success === 1 || data.success === true;
  } catch (err: any) {
    logger.error("SMS Pool error", { err: err.message });
    return false;
  }
}

/* ─── Core Functions ─── */

/**
 * Send an OTP code to the given phone number.
 * 1. Generates a 6-digit code
 * 2. Invalidates any previous unexpired OTPs for same phone+purpose
 * 3. Stores the new code in OtpVerification
 * 4. Delivers via Twilio (primary) → SMS Pool eSIM (fallback) → dev console
 */
export async function sendOtp(
  phone: string,
  purpose: OtpPurpose = "LOGIN"
): Promise<OtpSendResult> {
  // Validate phone
  if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) {
    return { success: false, error: "Invalid phone number. Use E.164 format (+1234567890)." };
  }

  // Rate-limit: max 3 OTPs per phone per 10 minutes
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentCount = await prisma.otpVerification.count({
    where: { phone, purpose, createdAt: { gte: tenMinAgo } },
  });
  if (recentCount >= 3) {
    return { success: false, error: "Too many OTP requests. Please wait a few minutes." };
  }

  const code = generateCode(6);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Mark all previous unverified OTPs as expired (set expiresAt to now)
  await prisma.otpVerification.updateMany({
    where: { phone, purpose, verified: false, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });

  // Store new OTP
  await prisma.otpVerification.create({
    data: { phone, code, purpose, expiresAt },
  });

  // Deliver SMS
  const body = `Advancia Healthcare: Your verification code is ${code}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`;

  // Try Twilio first
  const twilioResult = await sendSms({ to: phone, body });
  if (twilioResult.success) {
    return { success: true, expiresAt, maskedPhone: maskPhone(phone) };
  }

  // Fallback: SMS Pool eSIM
  const poolOk = await sendViaSmsPool(phone, body);
  if (poolOk) {
    return { success: true, expiresAt, maskedPhone: maskPhone(phone) };
  }

  // Dev mode: Twilio returns success in dev mode already, but just in case
  if (process.env.NODE_ENV !== 'production') {
    logger.debug("OTP generated in dev mode", { phone, expiresAt: expiresAt.toISOString() });
  }
  return { success: true, expiresAt, maskedPhone: maskPhone(phone) };
}

/**
 * Verify an OTP code.
 * Returns success if the code is valid, not expired, and under max attempts.
 */
export async function verifyOtp(
  phone: string,
  code: string,
  purpose: OtpPurpose = "LOGIN"
): Promise<OtpVerifyResult> {
  if (!phone || !code) {
    return { success: false, error: "Phone and code are required." };
  }

  // Find the latest non-verified OTP for this phone+purpose
  const record = await prisma.otpVerification.findFirst({
    where: { phone, purpose, verified: false },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return { success: false, error: "No pending OTP found. Please request a new code." };
  }

  // Check expiry
  if (record.expiresAt < new Date()) {
    return { success: false, error: "OTP has expired. Please request a new code." };
  }

  // Check attempts
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { success: false, error: "Too many failed attempts. Please request a new code." };
  }

  // Increment attempts
  await prisma.otpVerification.update({
    where: { id: record.id },
    data: { attempts: record.attempts + 1 },
  });

  // Verify code
  if (record.code !== code) {
    const remaining = OTP_MAX_ATTEMPTS - (record.attempts + 1);
    return {
      success: false,
      error: remaining > 0
        ? `Invalid code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
        : "Too many failed attempts. Please request a new code.",
    };
  }

  // Mark as verified
  await prisma.otpVerification.update({
    where: { id: record.id },
    data: { verified: true },
  });

  return { success: true, phone };
}

/**
 * Cleanup expired/old OTP records (run via cron).
 * Deletes records older than 1 hour.
 */
export async function cleanupExpiredOtps(): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const result = await prisma.otpVerification.deleteMany({
    where: { createdAt: { lt: oneHourAgo } },
  });
  return result.count;
}
