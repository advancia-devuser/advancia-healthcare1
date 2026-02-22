import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!ADMIN_JWT_SECRET && typeof window === "undefined") {
  console.warn("⚠️ ADMIN_JWT_SECRET not set — admin auth will fail in production");
}
const ADMIN_SECRET = new TextEncoder().encode(
  ADMIN_JWT_SECRET || "dev-only-admin-secret-never-use-in-prod"
);

const USER_JWT_SECRET = process.env.USER_JWT_SECRET;
if (!USER_JWT_SECRET && typeof window === "undefined") {
  console.warn("⚠️ USER_JWT_SECRET not set — user auth will fail in production");
}
const USER_SECRET = new TextEncoder().encode(
  USER_JWT_SECRET || "dev-only-user-secret-never-use-in-prod"
);

/* ──────────────────── Admin JWT helpers ──────────────────── */

export async function signAdminToken(extra?: Record<string, unknown>) {
  return new SignJWT({ role: "ADMIN", ...extra })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(ADMIN_SECRET);
}

export async function verifyAdminToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, ADMIN_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  if (!token) return false;
  const payload = await verifyAdminToken(token);
  return payload?.role === "ADMIN";
}

/* ──────────────────── User JWT helpers ──────────────────── */

/**
 * Sign a user session JWT. Embeds userId and wallet address.
 * Valid for 24 hours.
 */
export async function signUserToken(userId: string, address: string) {
  return new SignJWT({ sub: userId, address: address.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(USER_SECRET);
}

/**
 * Verify a user session JWT. Returns payload or null.
 */
export async function verifyUserToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, USER_SECRET);
    return payload as { sub: string; address: string };
  } catch {
    return null;
  }
}

/* ────────────── User resolution from wallet address ────────────── */

/**
 * Resolve a user by their blockchain wallet address.
 * Creates a new PENDING user if none exists.
 */
export async function resolveUser(address: string) {
  const lower = address.toLowerCase();
  let user = await prisma.user.findUnique({ where: { address: lower } });
  if (!user) {
    user = await prisma.user.create({
      data: { address: lower },
    });
  }
  return user;
}

/**
 * Get the authenticated user from JWT session.
 * SECURITY: Only accepts signed JWT tokens. No header fallbacks.
 */
export async function getAuthUser(request: Request) {
  // 1) Try JWT from Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await verifyUserToken(token);
    if (payload?.sub) {
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (user) return user;
    }
  }

  // 2) Try JWT from cookie
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("user_session")?.value;
    if (sessionToken) {
      const payload = await verifyUserToken(sessionToken);
      if (payload?.sub) {
        const user = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (user) return user;
      }
    }
  } catch {
    // cookies() may throw in certain contexts — ignore
  }

  // No valid JWT found — user is not authenticated
  return null;
}

/**
 * Require an APPROVED user. Returns user or throws a Response.
 */
export async function requireApprovedUser(request: Request) {
  const user = await getAuthUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }
  if (user.status !== "APPROVED") {
    throw new Response(
      JSON.stringify({ error: "Account not approved", status: user.status }),
      { status: 403 }
    );
  }
  return user;
}

/* ──────────────────── Rate Limiter (in-memory) ──────────────────── */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple in-memory rate limiter.
 * Returns true if the request is within the limit, false if exceeded.
 * @param key - identifier (IP, userId, etc.)
 * @param maxRequests - max requests per window
 * @param windowMs - window in milliseconds (default: 60s)
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Extract client IP from request for rate limiting.
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
