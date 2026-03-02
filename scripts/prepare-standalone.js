#!/usr/bin/env node
/**
 * Prepare Next.js Standalone Output for Production
 * ─────────────────────────────────────────────────
 * Next.js `output: "standalone"` generates a minimal server at
 * `.next/standalone/server.js`, but it does NOT bundle static assets.
 *
 * This script copies the required folders so the standalone server
 * can serve everything correctly:
 *   1. .next/static       → .next/standalone/.next/static
 *   2. public              → .next/standalone/public
 *
 * Usage:
 *   node scripts/prepare-standalone.js
 *   node .next/standalone/server.js   # then run the server
 *
 * See: https://nextjs.org/docs/app/api-reference/config/next-config-js/output#automatically-copying-traced-files
 */

import { cpSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const STANDALONE = join(ROOT, ".next", "standalone");
const NEXT_STATIC_SRC = join(ROOT, ".next", "static");
const NEXT_STATIC_DEST = join(STANDALONE, ".next", "static");
const PUBLIC_SRC = join(ROOT, "public");
const PUBLIC_DEST = join(STANDALONE, "public");

function main() {
  if (!existsSync(STANDALONE)) {
    console.error("❌ .next/standalone does not exist. Run `npm run build` first.");
    process.exit(1);
  }

  // 1. Copy .next/static → .next/standalone/.next/static
  if (existsSync(NEXT_STATIC_SRC)) {
    mkdirSync(join(STANDALONE, ".next"), { recursive: true });
    cpSync(NEXT_STATIC_SRC, NEXT_STATIC_DEST, { recursive: true });
    console.log("✅ Copied .next/static → .next/standalone/.next/static");
  } else {
    console.warn("⚠️  .next/static not found — skipping");
  }

  // 2. Copy public → .next/standalone/public
  if (existsSync(PUBLIC_SRC)) {
    cpSync(PUBLIC_SRC, PUBLIC_DEST, { recursive: true });
    console.log("✅ Copied public → .next/standalone/public");
  } else {
    console.warn("⚠️  public folder not found — skipping");
  }

  console.log("\n🚀 Standalone server is ready:");
  console.log("   node .next/standalone/server.js");
}

main();
