/**
 * API Response Helpers — Advancia Smart Wallets
 * ──────────────────────────────────────────────
 * Thin wrappers around `NextResponse.json()` that enforce a consistent
 * response shape across all API routes.
 *
 * Usage:
 *   import { apiOk, apiCreated, apiError, apiServerError } from "@/lib/api-helpers";
 *
 *   return apiOk({ user });                     // 200
 *   return apiCreated({ subscription });         // 201
 *   return apiError("Invalid email", 400);       // 400 { error: "..." }
 *   return apiServerError(err, "transfers.POST");// 500 (logs internally)
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// ─── Success responses ───────────────────────────────────────

/** 200 OK with a JSON body. */
export function apiOk<T extends Record<string, unknown>>(body: T) {
  return NextResponse.json(body, { status: 200 });
}

/** 201 Created with a JSON body. */
export function apiCreated<T extends Record<string, unknown>>(body: T) {
  return NextResponse.json(body, { status: 201 });
}

// ─── Error responses ─────────────────────────────────────────

/**
 * Return a standard `{ error }` JSON response.
 *
 * @param message  Human-readable message shown to the client.
 * @param status   HTTP status code (default 400).
 */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Well-known error codes that are safe to surface to clients.
 * Other ledger / DB errors should go through `apiServerError`.
 */
const SAFE_ERROR_PATTERNS = [
  "Insufficient balance",
  "not found",
  "already exists",
] as const;

/**
 * Catch-all for uncaught exceptions in API handlers.
 *
 * • Logs the real error with the operation context.
 * • Returns a safe, generic 500 to the client — never leaks
 *   internal messages.
 * • If the error matches a known safe pattern it returns a 400 instead.
 *
 * @param err            The caught value (may not be an Error).
 * @param operationName  e.g. "transfers.POST", "billing.GET" — for log correlation.
 */
export function apiServerError(err: unknown, operationName?: string): Response {
  // Re-throw Response objects produced by requireApprovedUser / requireAdmin
  if (err instanceof Response) return err;

  // Check for known, client-safe error messages
  if (err instanceof Error) {
    for (const pattern of SAFE_ERROR_PATTERNS) {
      if (err.message.includes(pattern)) {
        return apiError(err.message, 400);
      }
    }
  }

  // Log full details server-side — never expose to client
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`API error in ${operationName ?? "unknown"}`, {
    err: err instanceof Error ? err : { message },
  });

  return apiError("Server error", 500);
}
