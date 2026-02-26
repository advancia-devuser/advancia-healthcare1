import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signUserToken, checkRateLimitPersistent, getClientIP } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizePassword(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeOptionalName(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

/**
 * POST /api/auth/email/register
 * Body: { email: string, password: string, name?: string }
 * Creates a new user with email/password. Issues a session cookie.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIP(request);
    if (!(await checkRateLimitPersistent(`email-register:${ip}`, 5, 60_000))) {
      return NextResponse.json({ error: "Too many attempts. Try later." }, { status: 429 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { email, password, name } = body as {
      email?: unknown;
      password?: unknown;
      name?: unknown;
    };

    const normalizedEmail = normalizeEmail(email);
    const normalizedPassword = normalizePassword(password);
    const normalizedName = normalizeOptionalName(name);

    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!normalizedPassword || normalizedPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    if (name !== undefined && normalizedName === null) {
      return NextResponse.json({ error: "Name must be a non-empty string when provided" }, { status: 400 });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(normalizedPassword, 12);

    // Generate a placeholder address for email-only users
    const placeholderAddress = `email-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: normalizedName,
        address: placeholderAddress,
        status: "PENDING",
      },
    });

    // Issue session JWT
    const token = await signUserToken(user.id, user.address);
    const cookieStore = await cookies();
    cookieStore.set("user_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 86400, // 24 hours
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("[Email Register]", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
