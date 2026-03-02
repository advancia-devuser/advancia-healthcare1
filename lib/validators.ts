/**
 * Shared Input Validators — Advancia Smart Wallets
 * ─────────────────────────────────────────────────
 * Centralised normalisation and validation helpers used by API route handlers.
 *
 * Usage:
 *   import { normalizeNonEmptyString, parsePositiveInt, parseChainId } from "@/lib/validators";
 *
 * These functions replace the per-route copies that were previously duplicated
 * across 20+ route files.  All return `null` on invalid input so callers can
 * respond with a 400 immediately.
 */

// ─── String helpers ──────────────────────────────────────────

/**
 * Returns a trimmed non-empty string, or `null` if the input is
 * falsy / only whitespace.
 */
export function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Returns a trimmed string or `null`.
 * Unlike `normalizeNonEmptyString`, empty string → `null` (same result),
 * but the intent communicates "this field is optional".
 */
export function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// ─── Numeric helpers ─────────────────────────────────────────

/**
 * Parse a query-string value as a positive integer.
 * Falls back to `fallback` when the value is missing or invalid.
 */
export function parsePositiveInt(
  value: string | null | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/**
 * Same contract as `parsePositiveInt` — an alias used in routes that
 * adopted a slightly different name.
 */
export const parsePositiveInteger = parsePositiveInt;

/**
 * Parse a string that represents a positive integer amount (e.g. wei).
 * Uses `BigInt` internally so values > `Number.MAX_SAFE_INTEGER` are safe.
 * Returns the canonical decimal string or `null`.
 */
export function parsePositiveIntString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    const parsed = BigInt(trimmed);
    return parsed > BigInt(0) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Normalise and validate an amount string that must be a positive integer
 * (suitable for wei / smallest-unit values passed to BigInt).
 * Returns the cleaned string or `null`.
 */
export function normalizePositiveAmount(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  try {
    return BigInt(str) > BigInt(0) ? str : null;
  } catch {
    return null;
  }
}

/**
 * Like `normalizePositiveAmount` but also accepts decimal strings
 * (e.g. "12.50").  Returns the cleaned string or `null`.
 */
export function normalizePositiveDecimal(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const str = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) return null;
  const num = Number(str);
  return Number.isFinite(num) && num > 0 ? str : null;
}

// ─── Chain-ID helper ─────────────────────────────────────────

/**
 * Return a validated chain-ID or `fallback` when the raw value is
 * `undefined` / `null`.  Returns `null` (= invalid) if the value is
 * present but cannot be parsed to a positive integer.
 */
export function parseChainId(
  value: unknown,
  fallback?: number
): number | null {
  if (value === undefined || value === null) return fallback ?? null;
  const parsed =
    typeof value === "number"
      ? Math.trunc(value)
      : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

// ─── Email helper ────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lower-case, trim, and validate an email address.
 * Returns the normalised email or `null`.
 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

/**
 * Quick heuristic check — does the string look like an email?
 */
export function isLikelyEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

// ─── Date helper ─────────────────────────────────────────────

/**
 * Parse an ISO-8601 date string.
 * Returns a `Date` or `null` if the value is missing / unparseable.
 */
export function parseOptionalDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
