/**
 * Health Check Endpoint
 * ─────────────────────
 * GET /api/health → { status: "ok", timestamp, uptime, db }
 *
 * Used by Nginx / Docker / cloud load balancers for liveness probes.
 * Includes a lightweight DB connectivity check so that load balancers
 * can detect and route around database outages.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  const deployment = Object.fromEntries(
    Object.entries({
      vercelEnv: process.env.VERCEL_ENV,
      vercelRegion: process.env.VERCEL_REGION,
      vercelUrl: process.env.VERCEL_URL,
      gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA,
      gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF,
      gitCommitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE,
      gitRepoSlug: process.env.VERCEL_GIT_REPO_SLUG,
      gitRepoOwner: process.env.VERCEL_GIT_REPO_OWNER,
    }).filter(([, value]) => Boolean(value))
  );

  // Lightweight DB connectivity check — SELECT 1
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs: number | undefined;
  try {
    const start = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    dbLatencyMs = Date.now() - start;
  } catch (err) {
    dbStatus = "error";
    logger.error("Health check: DB unreachable", {
      err: err instanceof Error ? err : { message: String(err) },
    });
  }

  const overallStatus = dbStatus === "ok" ? "ok" : "degraded";
  const statusCode = overallStatus === "ok" ? 200 : 503;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: { status: dbStatus, latencyMs: dbLatencyMs },
      deployment: Object.keys(deployment).length ? deployment : undefined,
    },
    { status: statusCode }
  );
}
