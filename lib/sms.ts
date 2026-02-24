/**
 * SMS Service — Advancia Healthcare
 * ──────────────────────────────────
 * Multi-provider SMS delivery with automatic fallback:
 *   1. Brevo (ex-Sendinblue) — free 300 SMS/day, email signup only
 *   2. Twilio — if upgraded account available
 *   3. Textbelt — simple API, no signup for testing
 *   4. Dev console fallback
 *
 * Environment variables:
 *   BREVO_API_KEY         — Brevo (Sendinblue) API key (recommended)
 *   BREVO_SENDER_NAME     — Sender name (default: "Advancia")
 *   TWILIO_ACCOUNT_SID    — Twilio Account SID
 *   TWILIO_AUTH_TOKEN      — Twilio Auth Token
 *   TWILIO_PHONE_NUMBER    — Twilio phone number
 *   TEXTBELT_API_KEY       — Textbelt key ("textbelt" for 1 free/day, or paid key)
 *   TEXTBELT               — Alias for TEXTBELT_API_KEY
 *   SMS_PROVIDER           — Force provider: "brevo" | "twilio" | "textbelt" | "auto" (default)
 */

/* ─── Types ─── */

export interface SendSmsOptions {
  to: string;
  body: string;
}

export interface SmsResult {
  success: boolean;
  sid?: string;
  provider?: string;
  error?: string;
}

/* ─── Config ─── */

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Advancia";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "";
const TEXTBELT_API_KEY = process.env.TEXTBELT_API_KEY || process.env.TEXTBELT || "";
const SMS_PROVIDER = process.env.SMS_PROVIDER || "auto";

/* ─── Provider: Brevo (ex-Sendinblue) ─── */

async function sendViaBrevo(to: string, body: string): Promise<SmsResult> {
  if (!BREVO_API_KEY) return { success: false, error: "BREVO_API_KEY not set" };

  try {
    const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        type: "transactional",
        unicodeEnabled: false,
        sender: BREVO_SENDER_NAME,
        recipient: to.replace("+", "00"),
        content: body,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Brevo SMS ERROR] ${res.status}: ${err}`);
      return { success: false, provider: "brevo", error: err };
    }

    const data = await res.json();
    return { success: true, provider: "brevo", sid: data.messageId || data.reference };
  } catch (err: any) {
    console.error("[Brevo SMS ERROR]", err.message);
    return { success: false, provider: "brevo", error: err.message };
  }
}

/* ─── Provider: Twilio ─── */

async function sendViaTwilio(to: string, body: string): Promise<SmsResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return { success: false, error: "Twilio credentials not set" };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: TWILIO_PHONE_NUMBER,
        To: to,
        Body: body,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Twilio SMS ERROR] ${res.status}: ${err}`);
      return { success: false, provider: "twilio", error: err };
    }

    const data = await res.json();
    return { success: true, provider: "twilio", sid: data.sid };
  } catch (err: any) {
    console.error("[Twilio SMS ERROR]", err.message);
    return { success: false, provider: "twilio", error: err.message };
  }
}

/* ─── Provider: Textbelt ─── */

async function sendViaTextbelt(to: string, body: string): Promise<SmsResult> {
  const key = TEXTBELT_API_KEY || "textbelt"; // "textbelt" = 1 free SMS/day

  try {
    const res = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: to, message: body, key }),
    });

    const data = await res.json();
    if (data.success) {
      return { success: true, provider: "textbelt", sid: data.textId };
    }
    return { success: false, provider: "textbelt", error: data.error || "Textbelt send failed" };
  } catch (err: any) {
    console.error("[Textbelt SMS ERROR]", err.message);
    return { success: false, provider: "textbelt", error: err.message };
  }
}

/* ─── Core Sender (multi-provider with fallback) ─── */

export async function sendSms(options: SendSmsOptions): Promise<SmsResult> {
  const { to, body } = options;

  // Validate phone number (basic E.164 check)
  if (!to || !/^\+[1-9]\d{6,14}$/.test(to)) {
    return { success: false, error: `Invalid phone number: ${to}` };
  }

  // If a specific provider is forced
  if (SMS_PROVIDER === "brevo") return sendViaBrevo(to, body);
  if (SMS_PROVIDER === "twilio") return sendViaTwilio(to, body);
  if (SMS_PROVIDER === "textbelt") return sendViaTextbelt(to, body);

  // Auto mode: try providers in order
  const providers = [
    { name: "brevo", fn: () => sendViaBrevo(to, body), available: !!BREVO_API_KEY },
    { name: "twilio", fn: () => sendViaTwilio(to, body), available: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) },
    { name: "textbelt", fn: () => sendViaTextbelt(to, body), available: true },
  ];

  for (const p of providers) {
    if (!p.available) continue;
    const result = await p.fn();
    if (result.success) {
      console.log(`[SMS] Delivered via ${p.name} to ${to.slice(0, 5)}***`);
      return result;
    }
    console.warn(`[SMS] ${p.name} failed: ${result.error} — trying next...`);
  }

  // All providers failed — dev mode fallback
  console.log(`\n📱 [SMS — DEV MODE]\n  To: ${to}\n  Body: ${body}\n`);
  return { success: true, provider: "dev-console", sid: `dev-sms-${Date.now()}` };
}

/* ─── Pre-built SMS Templates ─── */

/** Account status change */
export async function sendAccountStatusSms(
  to: string,
  status: "APPROVED" | "REJECTED" | "SUSPENDED" | "RESTORED"
): Promise<SmsResult> {
  const messages: Record<string, string> = {
    APPROVED: "Advancia Healthcare: Your account has been approved! You can now access all features. Login at advancia.health",
    REJECTED: "Advancia Healthcare: Your account application was not approved. Contact support for details.",
    SUSPENDED: "Advancia Healthcare: Your account has been temporarily suspended. Contact support if you have questions.",
    RESTORED: "Advancia Healthcare: Your account has been restored and is fully active again.",
  };

  return sendSms({ to, body: messages[status] || messages.APPROVED });
}

/** Withdrawal status update */
export async function sendWithdrawalSms(
  to: string,
  status: "APPROVED" | "REJECTED",
  amount: string,
  asset: string
): Promise<SmsResult> {
  const body = status === "REJECTED"
    ? `Advancia Healthcare: Your withdrawal of ${amount} ${asset} was rejected. Contact support for details.`
    : `Advancia Healthcare: Your withdrawal of ${amount} ${asset} has been approved and is being processed.`;

  return sendSms({ to, body });
}

/** Security alert (login, 2FA change, suspicious activity) */
export async function sendSecurityAlertSms(
  to: string,
  event: string
): Promise<SmsResult> {
  return sendSms({
    to,
    body: `Advancia Healthcare Security Alert: ${event}. If this wasn't you, contact support immediately.`,
  });
}

/** Health reminder */
export async function sendHealthReminderSms(
  to: string,
  reminderType: string,
  message: string
): Promise<SmsResult> {
  return sendSms({
    to,
    body: `Advancia Healthcare Reminder — ${reminderType}: ${message}`,
  });
}

/** Generic notification */
export async function sendNotificationSms(
  to: string,
  action: string,
  detail?: string
): Promise<SmsResult> {
  const friendly = action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const body = detail
    ? `Advancia Healthcare: ${friendly} — ${detail}`
    : `Advancia Healthcare: ${friendly}. Check your dashboard for details.`;

  return sendSms({ to, body: body.slice(0, 160) }); // SMS limit
}
