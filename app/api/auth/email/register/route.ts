import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signUserToken, checkRateLimitPersistent, getClientIP } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

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

    const { email, password, name } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate a placeholder address for email-only users
    const placeholderAddress = `email-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name: name || null,
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
  } catch (err: any) {
    console.error("[Email Register]", err);
    return NextResponse.json({ error: err.message || "Registration failed" }, { status: 500 });
  }
}
