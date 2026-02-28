/**
 * Structured Logger — Advancia Healthcare
 * ────────────────────────────────────────
 * Centralised, JSON-structured logging with environment-aware log levels.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("User registered", { userId: "u1", address: "0x..." });
 *   logger.error("Payment failed", { orderId: "o1", err: error });
 *
 * In production (NODE_ENV=production) output is JSON (one line per entry).
 * In development output is human-readable with colours.
 *
 * The interface is intentionally compatible with pino — swap in a real pino
 * instance later by changing the export without touching call sites.
 */

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const IS_PROD = process.env.NODE_ENV === "production";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

/** Serialise an Error into a plain object */
function serialiseExtra(extra?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!extra) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (v instanceof Error) {
      out[k] = { message: v.message, name: v.name, stack: v.stack };
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emit(level: LogLevel, msg: string, extra?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...serialiseExtra(extra),
  };

  if (IS_PROD) {
    // Structured JSON — one line per entry for log aggregators
    const fn = level === "error" || level === "fatal" ? console.error : console.log;
    fn(JSON.stringify(entry));
  } else {
    // Human-readable for development
    const colours: Record<LogLevel, string> = {
      debug: "\x1b[90m", // grey
      info: "\x1b[36m",  // cyan
      warn: "\x1b[33m",  // yellow
      error: "\x1b[31m", // red
      fatal: "\x1b[35m", // magenta
    };
    const reset = "\x1b[0m";
    const prefix = `${colours[level]}[${level.toUpperCase()}]${reset}`;

    const extraStr = extra && Object.keys(extra).length > 0
      ? ` ${JSON.stringify(serialiseExtra(extra))}`
      : "";

    const fn = level === "error" || level === "fatal" ? console.error : console.log;
    fn(`${prefix} ${msg}${extraStr}`);
  }
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit("error", msg, extra),
  fatal: (msg: string, extra?: Record<string, unknown>) => emit("fatal", msg, extra),

  /** Create a child logger with fixed extra fields */
  child(defaults: Record<string, unknown>) {
    return {
      debug: (msg: string, extra?: Record<string, unknown>) =>
        emit("debug", msg, { ...defaults, ...extra }),
      info: (msg: string, extra?: Record<string, unknown>) =>
        emit("info", msg, { ...defaults, ...extra }),
      warn: (msg: string, extra?: Record<string, unknown>) =>
        emit("warn", msg, { ...defaults, ...extra }),
      error: (msg: string, extra?: Record<string, unknown>) =>
        emit("error", msg, { ...defaults, ...extra }),
      fatal: (msg: string, extra?: Record<string, unknown>) =>
        emit("fatal", msg, { ...defaults, ...extra }),
    };
  },
};
