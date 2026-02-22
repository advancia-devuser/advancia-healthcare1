import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { signAdminToken, checkRateLimit, getClientIP } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyTotpCode } from "@/lib/totp";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/admin/login
 * Body: { password: string, totpCode?: string }
 * Sets an httpOnly admin_session cookie.
 * If admin 2FA is enabled, totpCode is required.
 */
export async function POST(request: Request) {
  try {
    // Rate limit: 5 attempts per 2 minutes
    const ip = getClientIP(request);
    if (!checkRateLimit(`admin-login:${ip}`, 5, 120_000)) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429 }
      );
    }

    const { password, totpCode } = await request.json();
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      console.error("ADMIN_PASSWORD env var is not set!");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    if (password !== expected) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // Check if admin 2FA is enabled
    const totpConfig = await prisma.adminConfig.findUnique({
      where: { key: "admin_totp_secret" },
    });

    if (totpConfig?.value) {
      // 2FA is enabled — require TOTP code
      if (!totpCode || typeof totpCode !== "string") {
        return NextResponse.json(
          { error: "2FA code required", requires2FA: true },
          { status: 403 }
        );
      }

      const secret = decrypt(totpConfig.value);
      const valid = verifyTotpCode(secret, totpCode);
      if (!valid) {
        return NextResponse.json(
          { error: "Invalid 2FA code", requires2FA: true },
          { status: 401 }
        );
      }
    }

    const token = await signAdminToken();
    const cookieStore = await cookies();
    cookieStore.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8, // 8 hours
      path: "/",
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/login
 * Clears the admin_session cookie (logout).
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set("admin_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
