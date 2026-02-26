import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { assertRedisRestEnvPair } from "@/lib/env";

assertRedisRestEnvPair();

const REDIS_REST_URL = process.env.REDIS_REST_URL;
const REDIS_REST_TOKEN = process.env.REDIS_REST_TOKEN;
const hasRedis = Boolean(REDIS_REST_URL && REDIS_REST_TOKEN);

type MemoryEntry = { value: string; expiresAt: number };
const memoryStore = new Map<string, MemoryEntry>();

function pruneMemoryStore(now = Date.now()) {
  for (const [key, entry] of memoryStore.entries()) {
    if (now >= entry.expiresAt) memoryStore.delete(key);
  }
}

async function redisCommand(command: Array<string | number>) {
  if (!hasRedis) return { result: null };
  const response = await fetch(`${REDIS_REST_URL}/${command.map((v) => encodeURIComponent(String(v))).join("/")}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${REDIS_REST_TOKEN}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Redis command failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return (await response.json()) as { result: unknown };
}

async function setWithTtl(key: string, value: string, ttlMs: number) {
  if (hasRedis) {
    await redisCommand(["SET", key, value, "PX", ttlMs]);
    return;
  }
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function getValue(key: string): Promise<string | null> {
  if (hasRedis) {
    const data = await redisCommand(["GET", key]);
    return typeof data.result === "string" ? data.result : null;
  }
  pruneMemoryStore();
  const entry = memoryStore.get(key);
  return entry ? entry.value : null;
}

async function deleteKey(key: string) {
  if (hasRedis) {
    await redisCommand(["DEL", key]);
    return;
  }
  memoryStore.delete(key);
}

async function getAndDelete(key: string): Promise<string | null> {
  if (hasRedis) {
    const data = await redisCommand(["GETDEL", key]);
    return typeof data.result === "string" ? data.result : null;
  }
  pruneMemoryStore();
  const entry = memoryStore.get(key);
  if (!entry) return null;
  memoryStore.delete(key);
  return entry.value;
}

async function incrementWithWindow(key: string, windowMs: number): Promise<number> {
  if (hasRedis) {
    const incr = await redisCommand(["INCR", key]);
    const count = Number(incr.result ?? 0);
    if (count === 1) {
      await redisCommand(["PEXPIRE", key, windowMs]);
    }
    return count;
  }

  pruneMemoryStore();
  const now = Date.now();
  const current = memoryStore.get(key);
  if (!current || now >= current.expiresAt) {
    memoryStore.set(key, { value: "1", expiresAt: now + windowMs });
    return 1;
  }
  const next = (parseInt(current.value, 10) || 0) + 1;
  memoryStore.set(key, { value: String(next), expiresAt: current.expiresAt });
  return next;
}

async function getTtlMs(key: string): Promise<number> {
  if (hasRedis) {
    const data = await redisCommand(["PTTL", key]);
    const ttl = Number(data.result ?? -1);
    return ttl > 0 ? ttl : 0;
  }
  pruneMemoryStore();
  const entry = memoryStore.get(key);
  if (!entry) return 0;
  return Math.max(0, entry.expiresAt - Date.now());
}

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!ADMIN_JWT_SECRET && typeof window === "undefined") {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_JWT_SECRET is required in production");
  }
  console.warn("⚠️ ADMIN_JWT_SECRET not set — using dev-only fallback secret");
}
const ADMIN_SECRET = new TextEncoder().encode(
  ADMIN_JWT_SECRET || "dev-only-admin-secret-never-use-in-prod"
);

const USER_JWT_SECRET = process.env.USER_JWT_SECRET;
if (!USER_JWT_SECRET && typeof window === "undefined") {
  if (process.env.NODE_ENV === "production") {
    throw new Error("USER_JWT_SECRET is required in production");
  }
  console.warn("⚠️ USER_JWT_SECRET not set — using dev-only fallback secret");
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
 * @deprecated Runtime routes should prefer checkRateLimitPersistent().
 * Kept for backward compatibility and isolated unit tests.
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
 * Persistent rate limiter using Redis (when configured) with in-memory fallback.
 */
export async function checkRateLimitPersistent(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): Promise<boolean> {
  const count = await incrementWithWindow(`rl:${key}`, windowMs);
  return count <= maxRequests;
}

/**
 * Store a one-time auth nonce with TTL.
 */
export async function storeAuthNonce(address: string, nonce: string, ttlMs: number = 5 * 60_000) {
  await setWithTtl(`nonce:${address.toLowerCase()}`, nonce, ttlMs);
}

/**
 * Consume (read + delete) a one-time auth nonce.
 */
export async function consumeAuthNonce(address: string): Promise<string | null> {
  return getAndDelete(`nonce:${address.toLowerCase()}`);
}

export async function registerAdminFailure(ip: string): Promise<{ count: number; lockMs: number }> {
  const failureWindowMs = 15 * 60_000;
  const failuresKey = `admin:fail:${ip}`;
  const lockKey = `admin:lock:${ip}`;

  const count = await incrementWithWindow(failuresKey, failureWindowMs);
  const threshold = 5;

  if (count >= threshold) {
    const step = count - threshold;
    const lockMinutes = Math.min(30, 5 * Math.pow(2, step));
    const lockMs = lockMinutes * 60_000;
    await setWithTtl(lockKey, "1", lockMs);
    return { count, lockMs };
  }

  return { count, lockMs: 0 };
}

export async function getAdminLockRemainingMs(ip: string): Promise<number> {
  const lockKey = `admin:lock:${ip}`;
  const lockValue = await getValue(lockKey);
  if (!lockValue) return 0;
  return getTtlMs(lockKey);
}

export async function clearAdminFailureState(ip: string) {
  await Promise.all([deleteKey(`admin:fail:${ip}`), deleteKey(`admin:lock:${ip}`)]);
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
