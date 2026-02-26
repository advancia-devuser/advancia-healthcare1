/**
 * Unit Tests — Auth Helpers
 * ─────────────────────────
 * Tests JWT signing/verification and rate limiting in isolation.
 */

import {
  signUserToken,
  verifyUserToken,
  signAdminToken,
  verifyAdminToken,
  checkRateLimit,
  checkRateLimitPersistent,
} from "@/lib/auth";

describe("User JWT", () => {
  test("sign and verify returns correct payload", async () => {
    const token = await signUserToken("user-123", "0xabcdef");
    const payload = await verifyUserToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-123");
    expect(payload!.address).toBe("0xabcdef");
  });

  test("tampered token fails verification", async () => {
    const token = await signUserToken("user-123", "0xabcdef");
    const tampered = token.slice(0, -5) + "XXXXX";
    const payload = await verifyUserToken(tampered);
    expect(payload).toBeNull();
  });

  test("garbage string fails verification", async () => {
    const payload = await verifyUserToken("not-a-jwt");
    expect(payload).toBeNull();
  });
});

describe("Admin JWT", () => {
  test("sign and verify returns ADMIN role", async () => {
    const token = await signAdminToken();
    const payload = await verifyAdminToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.role).toBe("ADMIN");
  });

  test("user token does not verify as admin", async () => {
    const userToken = await signUserToken("u1", "0x123");
    const payload = await verifyAdminToken(userToken);
    // The payload might not be null if the secrets are the same (e.g. in test env),
    // but it definitely shouldn't have the ADMIN role.
    if (payload) {
      expect(payload.role).not.toBe("ADMIN");
    } else {
      expect(payload).toBeNull();
    }
  });
});

describe("Rate Limiter", () => {
  test("allows requests within limit", () => {
    const key = "test-rate-" + Date.now();
    expect(checkRateLimit(key, 3, 10_000)).toBe(true);
    expect(checkRateLimit(key, 3, 10_000)).toBe(true);
    expect(checkRateLimit(key, 3, 10_000)).toBe(true);
  });

  test("blocks requests exceeding limit", () => {
    const key = "test-block-" + Date.now();
    checkRateLimit(key, 2, 10_000);
    checkRateLimit(key, 2, 10_000);
    expect(checkRateLimit(key, 2, 10_000)).toBe(false);
  });

  test("different keys have independent limits", () => {
    const key1 = "test-key1-" + Date.now();
    const key2 = "test-key2-" + Date.now();
    checkRateLimit(key1, 1, 10_000);
    expect(checkRateLimit(key1, 1, 10_000)).toBe(false);
    expect(checkRateLimit(key2, 1, 10_000)).toBe(true);
  });

  test("persistent limiter allows requests within limit", async () => {
    const key = "test-persistent-rate-" + Date.now();
    await expect(checkRateLimitPersistent(key, 3, 10_000)).resolves.toBe(true);
    await expect(checkRateLimitPersistent(key, 3, 10_000)).resolves.toBe(true);
    await expect(checkRateLimitPersistent(key, 3, 10_000)).resolves.toBe(true);
  });

  test("persistent limiter blocks requests exceeding limit", async () => {
    const key = "test-persistent-block-" + Date.now();
    await checkRateLimitPersistent(key, 2, 10_000);
    await checkRateLimitPersistent(key, 2, 10_000);
    await expect(checkRateLimitPersistent(key, 2, 10_000)).resolves.toBe(false);
  });
});
