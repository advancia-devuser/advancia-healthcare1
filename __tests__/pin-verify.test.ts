/**
 * Unit Tests — PIN Verification
 * ─────────────────────────────
 * Tests the verifyUserPin helper in isolation.
 */

import { verifyUserPin } from "@/lib/pin-verify";
import { scryptSync, randomBytes } from "crypto";

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

describe("verifyUserPin", () => {
  test("returns null (success) when user has no PIN set", async () => {
    const user = { id: "u1", pin: null };
    const result = await verifyUserPin(user, undefined);
    expect(result).toBeNull();
  });

  test("returns error when PIN is required but not provided", async () => {
    const user = { id: "u1", pin: hashPin("123456") };
    const result = await verifyUserPin(user, undefined);
    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.error).toContain("PIN is required");
  });

  test("returns error when PIN is incorrect", async () => {
    const user = { id: "u1", pin: hashPin("123456") };
    const result = await verifyUserPin(user, "000000");
    expect(result).not.toBeNull();
    const body = await result!.json();
    expect(body.error).toContain("Incorrect PIN");
  });

  test("returns null (success) when PIN is correct", async () => {
    const user = { id: "u1", pin: hashPin("654321") };
    const result = await verifyUserPin(user, "654321");
    expect(result).toBeNull();
  });

  test("returns error when empty string PIN is provided", async () => {
    const user = { id: "u1", pin: hashPin("123456") };
    const result = await verifyUserPin(user, "");
    expect(result).not.toBeNull();
  });
});
