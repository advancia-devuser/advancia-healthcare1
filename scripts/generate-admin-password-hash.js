#!/usr/bin/env node
import bcrypt from "bcryptjs";

const password = process.argv[2];
const roundsArg = process.argv[3];
const rounds = Number.isFinite(Number(roundsArg)) ? Number(roundsArg) : 12;

if (!password || password.trim().length < 10) {
  console.error("Usage: node scripts/generate-admin-password-hash.js <strong-password> [rounds]");
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
  console.error("Invalid rounds. Use an integer between 10 and 15.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, rounds);
console.log(hash);
