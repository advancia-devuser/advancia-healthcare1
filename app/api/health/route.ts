/**
 * Health Check Endpoint
 * ─────────────────────
 * GET /api/health → { status: "ok", timestamp, uptime }
 *
 * Used by Nginx / Docker / cloud load balancers for liveness probes.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
