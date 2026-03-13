// ═══════════════════════════════════════════════════════════════
//  SmartWallet — Next.js Middleware
// ═══════════════════════════════════════════════════════════════
//
//  Runs on the Edge Runtime before every matched request.
//    • Rate-limits /api/auth/* endpoints (brute-force protection)
//    • Validates CRON_SECRET for all /api/cron/* routes (centralized)
//    • Adds a unique X-Request-Id header for tracing
//    • Adds common security headers as a defence-in-depth layer
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";

const PAYROLL_REDIRECT_HOSTS = new Set([
  "advanciapayroll.com",
  "www.advanciapayroll.com",
]);
const PAYROLL_REDIRECT_TARGET = "https://advanciapayledger.com";

// ─── Rate limiter (sliding window, per-IP) ───────────────────
//  In production with multiple instances this should be backed by
//  Redis; the in-memory approach here is a defence-in-depth layer
//  that already covers single-instance and Vercel deployments.
// ──────────────────────────────────────────────────────────────

interface RateLimitEntry {
  /** Timestamps of requests inside the current window */
  timestamps: number[];
}

const AUTH_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const AUTH_RATE_LIMIT_MAX = 20; // max requests per window per IP

const rateLimitStore = new Map<string, RateLimitEntry>();

/** Prune expired entries periodically (every 100 calls) to prevent unbounded growth */
let rateLimitPruneCounter = 0;
function pruneRateLimitStore(now: number) {
  rateLimitPruneCounter++;
  if (rateLimitPruneCounter < 100) return;
  rateLimitPruneCounter = 0;
  for (const [key, entry] of rateLimitStore.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < AUTH_RATE_LIMIT_WINDOW_MS);
    if (entry.timestamps.length === 0) rateLimitStore.delete(key);
  }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function getRequestHost(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host") ||
    req.nextUrl.hostname ||
    ""
  )
    .toLowerCase()
    .replace(/:\d+$/, "");
}

/**
 * Returns a 429 response if the IP exceeds the auth rate limit,
 * or null if the request is allowed.
 */
function checkAuthRateLimit(req: NextRequest): NextResponse | null {
  const now = Date.now();
  pruneRateLimitStore(now);

  const ip = getClientIp(req);
  const key = `auth:${ip}`;

  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Drop timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < AUTH_RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= AUTH_RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil(
      (entry.timestamps[0] + AUTH_RATE_LIMIT_WINDOW_MS - now) / 1000
    );
    const res = NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(retryAfterSec));
    return res;
  }

  entry.timestamps.push(now);
  return null; // Allowed
}

// ─── Cron-route authentication ───────────────────────────────
function handleCronAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET MUST be set — reject if missing.
  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Server misconfiguration: CRON_SECRET not set" },
        { status: 500 }
      );
    }
    // In dev mode, allow unauthenticated cron calls for testing
    return null;
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null; // Authorized — continue
}

// ─── Main middleware ─────────────────────────────────────────
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 0. Keep the payroll domain as redirect-only  ─────────────
  const requestHost = getRequestHost(req);
  if (PAYROLL_REDIRECT_HOSTS.has(requestHost)) {
    const redirectUrl = new URL(req.nextUrl.toString());
    redirectUrl.protocol = "https:";
    redirectUrl.host = "advanciapayledger.com";
    return NextResponse.redirect(redirectUrl, 308);
  }

  // 1. API versioning — rewrite /api/v1/* to /api/*  ─────────
  //    This lets clients adopt versioned endpoints without
  //    renaming every route file.  When v2 is introduced, add
  //    a separate rewrite rule or new route tree.
  if (pathname.startsWith("/api/v1/")) {
    const rewritten = req.nextUrl.clone();
    rewritten.pathname = pathname.replace(/^\/api\/v1\//, "/api/");
    return NextResponse.rewrite(rewritten);
  }

  // 2. Rate-limit auth endpoints  ────────────────────────────
  if (pathname.startsWith("/api/auth")) {
    const limited = checkAuthRateLimit(req);
    if (limited) return limited;
  }

  // 3. Cron route gate  ──────────────────────────────────────
  if (pathname.startsWith("/api/cron")) {
    const denied = handleCronAuth(req);
    if (denied) return denied;
  }

  // 4. Continue with response headers  ───────────────────────
  const res = NextResponse.next();

  // Unique request ID for distributed tracing / log correlation
  const requestId =
    req.headers.get("x-request-id") ?? crypto.randomUUID();
  res.headers.set("X-Request-Id", requestId);

  // Defence-in-depth security headers (supplement next.config.mjs)
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // API version header — lets clients verify which version they hit
  if (pathname.startsWith("/api/")) {
    res.headers.set("X-API-Version", "v1");
  }

  return res;
}

// Only run on API routes and page navigations — skip static assets
export const config = {
  matcher: [
    "/robots.txt",
    "/sitemap.xml",
    // Match all API routes
    "/api/:path*",
    // Match page routes (exclude _next, static, favicon, etc.)
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
