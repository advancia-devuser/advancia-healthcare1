/**
 * Health Check Endpoint
 * ─────────────────────
 * GET /api/health → { status: "ok", timestamp, uptime }
 *
 * Used by Nginx / Docker / cloud load balancers for liveness probes.
 */

import { NextResponse } from "next/server";

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

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    deployment: Object.keys(deployment).length ? deployment : undefined,
  });
}
