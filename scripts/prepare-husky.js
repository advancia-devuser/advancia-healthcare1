#!/usr/bin/env node

import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

try {
  const huskyBin = require.resolve("husky/bin.js");
  const result = spawnSync(process.execPath, [huskyBin], { stdio: "inherit" });
  process.exit(result.status ?? 0);
} catch {
  console.log("Skipping husky setup because the package is not installed.");
}