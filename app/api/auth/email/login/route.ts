import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signUserToken, checkRateLimitPersistent, getClientIP } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

/**
 * POST /api/auth/email/login
 * Body: { email: string, password: string }
 * Authenticates user by email/password and issues a session cookie.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIP(request);
    if (!(await checkRateLimitPersistent(`email-login:${ip}`, 10, 60_000))) {
      return NextResponse.json({ error: "Too many attempts. Try later." }, { status: 429 });
    }

    const { email, password } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.password) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Compare password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

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
    console.error("[Email Login]", err);
    return NextResponse.json({ error: err.message || "Login failed" }, { status: 500 });
  }
}
