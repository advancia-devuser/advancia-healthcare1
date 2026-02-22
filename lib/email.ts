/**
 * Email Service — Advancia Healthcare
 * ────────────────────────────────────
 * Centralized email delivery using Resend API (https://resend.com).
 * Falls back to console logs when RESEND_API_KEY is not set.
 *
 * Environment variables:
 *   RESEND_API_KEY       — Your Resend API key
 *   EMAIL_FROM           — Sender address (default: "Advancia Healthcare <noreply@advancia.health>")
 *   NEXT_PUBLIC_APP_URL  — Base URL for links in emails
 */

/* ─── Types ─── */

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/* ─── Config ─── */

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_ADDRESS = process.env.EMAIL_FROM || "Advancia Healthcare <noreply@advancia.health>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/* ─── Core Sender ─── */

export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const { to, subject, html, text } = options;

  // Dev mode fallback — log to console
  if (!RESEND_API_KEY) {
    console.log(
      `\n📧 [EMAIL — DEV MODE]\n  To: ${to}\n  Subject: ${subject}\n  Body (text): ${text || "(HTML only)"}\n`
    );
    return { success: true, messageId: `dev-${Date.now()}` };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
        ...(text ? { text } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[EMAIL ERROR] ${res.status}: ${err}`);
      return { success: false, error: err };
    }

    const data = await res.json();
    return { success: true, messageId: data.id };
  } catch (err: any) {
    console.error("[EMAIL ERROR]", err.message);
    return { success: false, error: err.message };
  }
}

/* ─── Shared Layout ─── */

function emailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f7fa; color:#1a1a2e; }
    .wrapper { max-width:600px; margin:0 auto; padding:40px 20px; }
    .card { background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); padding:32px 32px 24px; text-align:center; }
    .header img { height:36px; margin-bottom:8px; }
    .header h1 { margin:0; font-size:20px; font-weight:700; color:#ffffff; letter-spacing:-0.3px; }
    .body { padding:32px; }
    .body p { margin:0 0 16px; font-size:15px; line-height:1.6; color:#374151; }
    .btn { display:inline-block; padding:12px 28px; background:#0d9488; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:600; font-size:14px; }
    .btn:hover { background:#0f766e; }
    .code-box { display:inline-block; padding:14px 28px; background:#f0fdfa; border:2px dashed #0d9488; border-radius:12px; font-size:28px; font-weight:700; letter-spacing:6px; color:#0d9488; font-family:monospace; }
    .footer { padding:24px 32px; text-align:center; }
    .footer p { margin:0; font-size:12px; color:#9ca3af; }
    .divider { height:1px; background:#e5e7eb; margin:0; }
    .badge { display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
    .badge-green { background:#d1fae5; color:#065f46; }
    .badge-red { background:#fee2e2; color:#991b1b; }
    .badge-yellow { background:#fef3c7; color:#92400e; }
    .badge-blue { background:#dbeafe; color:#1e40af; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Advancia Healthcare</h1>
      </div>
      ${content}
      <div class="divider"></div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Advancia Healthcare. All rights reserved.</p>
        <p style="margin-top:8px;"><a href="${APP_URL}" style="color:#0d9488; text-decoration:none;">advancia.health</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* ─── Pre-built Templates ─── */

/** Email verification code */
export async function sendVerificationEmail(to: string, code: string): Promise<EmailResult> {
  const html = emailLayout(`
    <div class="body">
      <p>Hello,</p>
      <p>Please verify your email address by entering the code below in the app:</p>
      <div style="text-align:center; margin:24px 0;">
        <span class="code-box">${code}</span>
      </div>
      <p>This code expires in <strong>24 hours</strong>. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `);

  return sendEmail({
    to,
    subject: "Verify your email — Advancia Healthcare",
    html,
    text: `Your Advancia Healthcare verification code is: ${code}. This code expires in 24 hours.`,
  });
}

/** Account status change (approve, reject, suspend, restore) */
export async function sendAccountStatusEmail(
  to: string,
  status: "APPROVED" | "REJECTED" | "SUSPENDED" | "RESTORED"
): Promise<EmailResult> {
  const config: Record<string, { badge: string; heading: string; message: string }> = {
    APPROVED: {
      badge: '<span class="badge badge-green">Approved</span>',
      heading: "Your account has been approved!",
      message: "Great news — your Advancia Healthcare account is now fully active. You can access all features including wallet management, virtual cards, and health bookings.",
    },
    REJECTED: {
      badge: '<span class="badge badge-red">Rejected</span>',
      heading: "Account application update",
      message: "Unfortunately, your Advancia Healthcare account application was not approved at this time. If you believe this was a mistake, please reach out to our support team.",
    },
    SUSPENDED: {
      badge: '<span class="badge badge-yellow">Suspended</span>',
      heading: "Your account has been suspended",
      message: "Your Advancia Healthcare account has been temporarily suspended. Some features may be restricted. Please contact support if you have questions.",
    },
    RESTORED: {
      badge: '<span class="badge badge-green">Restored</span>',
      heading: "Your account has been restored!",
      message: "Your Advancia Healthcare account has been restored and is fully active again. You can resume using all features.",
    },
  };

  const c = config[status] || config.APPROVED;

  const html = emailLayout(`
    <div class="body">
      <div style="margin-bottom:20px;">${c.badge}</div>
      <p style="font-size:18px; font-weight:700; color:#111827;">${c.heading}</p>
      <p>${c.message}</p>
      <div style="text-align:center; margin:28px 0;">
        <a href="${APP_URL}/dashboard" class="btn">Go to Dashboard →</a>
      </div>
    </div>
  `);

  return sendEmail({
    to,
    subject: `Account ${status.toLowerCase()} — Advancia Healthcare`,
    html,
    text: `${c.heading}\n\n${c.message}\n\nVisit your dashboard: ${APP_URL}/dashboard`,
  });
}

/** Generic notification email (used by cron agent) */
export async function sendNotificationEmail(
  to: string,
  action: string,
  details?: Record<string, any>
): Promise<EmailResult> {
  const friendlyAction = action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  let detailsHtml = "";
  if (details && Object.keys(details).length > 0) {
    const rows = Object.entries(details)
      .filter(([k]) => !k.startsWith("__"))
      .map(([k, v]) => `<tr><td style="padding:6px 12px; font-weight:600; color:#6b7280; font-size:13px;">${k}</td><td style="padding:6px 12px; font-size:13px; color:#111827;">${v}</td></tr>`)
      .join("");
    if (rows) {
      detailsHtml = `
        <table style="width:100%; background:#f9fafb; border-radius:10px; margin:16px 0; border-collapse:collapse;">
          ${rows}
        </table>`;
    }
  }

  const html = emailLayout(`
    <div class="body">
      <p style="font-size:18px; font-weight:700; color:#111827;">${friendlyAction}</p>
      <p>You have a new notification on your Advancia Healthcare account.</p>
      ${detailsHtml}
      <div style="text-align:center; margin:28px 0;">
        <a href="${APP_URL}/dashboard" class="btn">View in Dashboard →</a>
      </div>
    </div>
  `);

  return sendEmail({
    to,
    subject: `${friendlyAction} — Advancia Healthcare`,
    html,
    text: `${friendlyAction}\n\nYou have a new notification. Visit your dashboard: ${APP_URL}/dashboard`,
  });
}

/** Withdrawal status email */
export async function sendWithdrawalEmail(
  to: string,
  status: "APPROVED" | "REJECTED" | "COMPLETED",
  amount: string,
  asset: string
): Promise<EmailResult> {
  const statusBadge = status === "REJECTED"
    ? '<span class="badge badge-red">Rejected</span>'
    : '<span class="badge badge-green">Approved</span>';

  const message = status === "REJECTED"
    ? `Your withdrawal request for <strong>${amount} ${asset}</strong> was rejected. Please contact support for more information.`
    : `Your withdrawal of <strong>${amount} ${asset}</strong> has been approved and is being processed.`;

  const html = emailLayout(`
    <div class="body">
      <div style="margin-bottom:20px;">${statusBadge}</div>
      <p style="font-size:18px; font-weight:700; color:#111827;">Withdrawal Update</p>
      <p>${message}</p>
      <div style="text-align:center; margin:28px 0;">
        <a href="${APP_URL}/dashboard" class="btn">View Details →</a>
      </div>
    </div>
  `);

  return sendEmail({
    to,
    subject: `Withdrawal ${status.toLowerCase()} — Advancia Healthcare`,
    html,
    text: `Withdrawal ${status.toLowerCase()}: ${amount} ${asset}. Visit: ${APP_URL}/dashboard`,
  });
}

/** Health reminder email */
export async function sendHealthReminderEmail(
  to: string,
  reminderTitle: string,
  reminderDescription?: string
): Promise<EmailResult> {
  const html = emailLayout(`
    <div class="body">
      <div style="margin-bottom:20px;"><span class="badge badge-blue">Health Reminder</span></div>
      <p style="font-size:18px; font-weight:700; color:#111827;">⏰ ${reminderTitle}</p>
      ${reminderDescription ? `<p>${reminderDescription}</p>` : ""}
      <p>Don't forget — staying on top of your health is important!</p>
      <div style="text-align:center; margin:28px 0;">
        <a href="${APP_URL}/dashboard" class="btn">Open Health Dashboard →</a>
      </div>
    </div>
  `);

  return sendEmail({
    to,
    subject: `Reminder: ${reminderTitle} — Advancia Healthcare`,
    html,
    text: `Health Reminder: ${reminderTitle}${reminderDescription ? `\n${reminderDescription}` : ""}\n\nVisit: ${APP_URL}/dashboard`,
  });
}
