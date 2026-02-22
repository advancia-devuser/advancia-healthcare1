import { PrismaClient } from "@prisma/client";

function assertDatabaseUrlIsSsl(url: string | undefined) {
  if (!url) return;
  const isPostgres = url.startsWith("postgresql://") || url.startsWith("postgres://");
  if (!isPostgres) return;

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
