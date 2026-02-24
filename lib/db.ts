import { PrismaClient } from "@prisma/client";

function assertDatabaseUrlIsSsl(url: string | undefined) {
  if (!url) return;
  const isPostgres = url.startsWith("postgresql://") || url.startsWith("postgres://");
  if (!isPostgres) return;

  // Local/dev Postgres typically runs without SSL; don't warn for localhost in non-production.
  try {
    const u = new URL(url);
    const host = u.hostname;
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    const sslmode = u.searchParams.get("sslmode")?.toLowerCase();
    // Always allow localhost connections without SSL. This keeps local Docker/Postgres
    // usable even when `next build` sets NODE_ENV=production.
    if (isLocalHost) {
      if (!sslmode || sslmode === "disable") return;
    }
  } catch {
    // If URL parsing fails, fall through to regex-based checks.
  }

  const hasSslMode = /[?&]sslmode=(require|verify-ca|verify-full)\b/i.test(url);
  if (!hasSslMode) {
    const msg =
      "DATABASE_URL must enable SSL for Postgres (add ?sslmode=require or stronger).";
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
    // Dev safety warning
    console.warn("⚠️ " + msg);
  }
}

assertDatabaseUrlIsSsl(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
