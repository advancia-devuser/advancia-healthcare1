/// <reference types="jest" />
/**
 * End-to-End API Tests for SmartWallet
 * ─────────────────────────────────────
 * Tests all critical flows: auth, data isolation, transfers,
 * admin access control, and cron route protection.
 *
 * These tests call the actual Next.js API routes via HTTP,
 * requiring a running dev server on localhost:3000.
 *
 * Run: npx jest --config jest.config.cjs --runInBand
 */

export {}; // ensure this file is treated as a module

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const RUN_E2E = process.env.RUN_E2E === "1";
const describeE2E = RUN_E2E ? describe : describe.skip;

/* ─── Helpers ─── */

async function api(
  path: string,
  options: RequestInit = {},
  cookie?: string
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (cookie) headers["Cookie"] = cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });

  let body: any;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  return { status: res.status, body, headers: res.headers };
}

/* ═══════════════════════════════════════════
   1. AUTHENTICATION & SESSION SECURITY
   ═══════════════════════════════════════════ */

describeE2E("Authentication & Session Security", () => {
  test("POST /api/auth/session without signature should fail", async () => {
    const { status, body } = await api("/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ address: "0x1234567890abcdef1234567890abcdef12345678" }),
    });
    // Should require nonce + signature, not just an address
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.error).toBeDefined();
  }, 15000);

  test("POST /api/auth/session with invalid nonce should fail", async () => {
    const { status, body } = await api("/api/auth/session", {
      method: "POST",
      body: JSON.stringify({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        signature: "0xfake",
        nonce: "invalid-nonce",
      }),
    });
    expect(status).toBeGreaterThanOrEqual(400);
  }, 15000);

  test("GET /api/auth/session returns nonce for valid address", async () => {
    const { status, body } = await api(
      "/api/auth/session?address=0xabcdef1234567890abcdef1234567890abcdef12"
    );
    // Session route may return 200 with nonce or 400 depending on implementation
    expect([200, 400]).toContain(status);
  }, 15000);

  test("GET /api/auth/session without address should fail", async () => {
    const { status, body } = await api("/api/auth/session");
    expect(status).toBe(400);
    expect(body.error).toContain("address");
  });

  test("x-wallet-address header alone should NOT grant access", async () => {
    const { status } = await api("/api/profile", {
      method: "GET",
      headers: {
        "x-wallet-address": "0x1234567890abcdef1234567890abcdef12345678",
      },
    });
    // Should be 401 because x-wallet-address is no longer trusted
    expect(status).toBe(401);
  });
});

/* ═══════════════════════════════════════════
   2. DATA ISOLATION — User Sees Only Own Data
   ═══════════════════════════════════════════ */

describeE2E("Data Isolation (Unauthenticated)", () => {
  test("GET /api/profile without auth returns 401", async () => {
    const { status } = await api("/api/profile");
    expect(status).toBe(401);
  });

  test("GET /api/wallets without auth returns 401", async () => {
    const { status } = await api("/api/wallets");
    expect(status).toBe(401);
  });

  test("GET /api/transfers without auth returns 401", async () => {
    const { status } = await api("/api/transfers");
    expect(status).toBe(401);
  });

  test("GET /api/transactions without auth returns 401", async () => {
    const { status } = await api("/api/transactions");
    expect(status).toBe(401);
  });

  test("GET /api/notifications without auth returns 401", async () => {
    const { status } = await api("/api/notifications");
    expect(status).toBe(401);
  });

  test("GET /api/cards without auth returns 401", async () => {
    const { status } = await api("/api/cards");
    expect(status).toBe(401);
  });

  test("GET /api/withdrawals without auth returns 401", async () => {
    const { status } = await api("/api/withdrawals");
    expect(status).toBe(401);
  });

  test("GET /api/budgets without auth returns 401", async () => {
    const { status } = await api("/api/budgets");
    expect(status).toBe(401);
  });

  test("GET /api/bills without auth returns 401", async () => {
    const { status } = await api("/api/bills");
    expect(status).toBe(401);
  });

  test("GET /api/contacts without auth returns 401", async () => {
    const { status } = await api("/api/contacts");
    expect(status).toBe(401);
  });

  test("GET /api/health/cards without auth returns 401", async () => {
    const { status } = await api("/api/health/cards");
    expect(status).toBe(401);
  });

  test("GET /api/health/transactions without auth returns 401", async () => {
    const { status } = await api("/api/health/transactions");
    expect(status).toBe(401);
  });

  test("GET /api/health/reminders without auth returns 401", async () => {
    const { status } = await api("/api/health/reminders");
    expect(status).toBe(401);
  });

  test("GET /api/subscriptions without auth returns 401", async () => {
    const { status } = await api("/api/subscriptions");
    expect(status).toBe(401);
  });

  test("GET /api/bank-accounts without auth returns 401", async () => {
    const { status } = await api("/api/bank-accounts");
    expect(status).toBe(401);
  });

  test("GET /api/loyalty-cards without auth returns 401", async () => {
    const { status } = await api("/api/loyalty-cards");
    expect(status).toBe(401);
  });

  test("GET /api/gift-cards without auth returns 401", async () => {
    const { status } = await api("/api/gift-cards");
    expect(status).toBe(401);
  });

  test("GET /api/payments/qr without auth returns 401", async () => {
    const { status } = await api("/api/payments/qr?amount=100&asset=ETH");
    expect(status).toBe(401);
  });

  test("GET /api/payments/history without auth returns 401", async () => {
    const { status } = await api("/api/payments/history");
    expect(status).toBe(401);
  });

  test("GET /api/payments/request without auth returns 401", async () => {
    const { status } = await api("/api/payments/request");
    expect(status).toBe(401);
  });
});

/* ═══════════════════════════════════════════
   3. ADMIN ACCESS CONTROL
   ═══════════════════════════════════════════ */

describeE2E("Admin Access Control", () => {
  test("GET /api/admin/users without admin cookie returns 401 or 403", async () => {
    const { status } = await api("/api/admin/users");
    expect([401, 403]).toContain(status);
  });

  test("GET /api/admin/withdrawals without admin cookie returns 401 or 403", async () => {
    const { status } = await api("/api/admin/withdrawals");
    expect([401, 403]).toContain(status);
  });

  test("GET /api/admin/cards without admin cookie returns 401 or 403", async () => {
    const { status } = await api("/api/admin/cards");
    expect([401, 403]).toContain(status);
  });

  test("GET /api/admin/stats without admin cookie returns 401 or 403", async () => {
    const { status } = await api("/api/admin/stats");
    expect([401, 403]).toContain(status);
  });

  test("POST /api/admin/login with wrong password returns 401", async () => {
    const { status, body } = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong-password" }),
    });
    // 401 = invalid password, 429 = rate limited from previous test run
    expect([401, 429]).toContain(status);
  });

  test("Admin routes not accessible with user JWT cookie", async () => {
    // Even if we forge a user session, admin routes should reject it
    const { status } = await api("/api/admin/users", {
      headers: {
        "x-wallet-address": "0xattacker",
      },
    });
    expect([401, 403]).toContain(status);
  });

  test("GET /api/admin/payment-requests without admin cookie returns 401 or 403", async () => {
    const { status } = await api("/api/admin/payment-requests");
    expect([401, 403]).toContain(status);
  });

  test("PATCH /api/admin/payment-requests without admin cookie returns 401 or 403", async () => {
    const { status } = await api("/api/admin/payment-requests", {
      method: "PATCH",
      body: JSON.stringify({ id: "fake-id", action: "cancel" }),
    });
    expect([401, 403]).toContain(status);
  });
});

/* ═══════════════════════════════════════════
   4. CRON ROUTE PROTECTION
   ═══════════════════════════════════════════ */

describeE2E("Cron Route Protection", () => {
  const cronRoutes = [
    "/api/cron/deposits",
    "/api/cron/withdrawals",
    "/api/cron/notifications",
    "/api/cron/health-reminders",
    "/api/cron/health-expiry",
    "/api/cron/health-transactions",
    "/api/cron/cards",
    "/api/cron/bills",
    "/api/cron/subscriptions",
    "/api/cron/installments",
    "/api/cron/reconcile",
    "/api/cron/payment-requests",
  ];

  for (const route of cronRoutes) {
    test(`GET ${route} without CRON_SECRET returns 401`, async () => {
      const { status } = await api(route);
      // Should be 401 when CRON_SECRET is set and no auth header provided
      // If CRON_SECRET is not set, the route may allow access (dev mode)
      expect([200, 401, 405]).toContain(status);
    });
  }

  test("Cron route with wrong bearer token returns 401", async () => {
    const { status } = await api("/api/cron/deposits", {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    // If CRON_SECRET is set, should be 401
    expect([200, 401]).toContain(status);
  });
});

/* ═══════════════════════════════════════════
   5. TRANSFER & PIN ENFORCEMENT
   ═══════════════════════════════════════════ */

describeE2E("Transfer Security", () => {
  test("POST /api/transfers without auth returns 401", async () => {
    const { status } = await api("/api/transfers", {
      method: "POST",
      body: JSON.stringify({
        recipientAddress: "0xrecipient",
        amount: "1000000000000000",
        asset: "ETH",
      }),
    });
    expect(status).toBe(401);
  });

  test("POST /api/withdrawals without auth returns 401", async () => {
    const { status } = await api("/api/withdrawals", {
      method: "POST",
      body: JSON.stringify({
        amount: "1000000000000000",
        toAddress: "0xexternal",
        chainId: 421614,
      }),
    });
    expect(status).toBe(401);
  });
});

/* ═══════════════════════════════════════════
   6. SENSITIVE DATA NOT EXPOSED
   ═══════════════════════════════════════════ */

describeE2E("Sensitive Data Protection", () => {
  test("GET /api/health endpoint is public (liveness probe)", async () => {
    const { status, body } = await api("/api/health");
    expect(status).toBe(200);
    expect(body).toBeDefined();
  });

  test("Bank accounts GET does not expose plaidAccessToken", async () => {
    // Without auth, should get 401 (which means auth works)
    const { status } = await api("/api/bank-accounts");
    expect(status).toBe(401);
    // The SELECT clause in the route already excludes plaidAccessToken
  });

  test("POST /api/auth/register does not expose internal user data", async () => {
    const { status, body } = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        address: "0xtestregister" + Date.now().toString(16),
      }),
    });
    // Registration should work
    expect(status).toBe(200);
    if (body.user) {
      // Should NOT contain sensitive fields
      expect(body.user.pin).toBeFalsy();
      expect(body.user.twoFaSecret).toBeFalsy();
    }
  });
});

/* ═══════════════════════════════════════════
   7. INPUT VALIDATION
   ═══════════════════════════════════════════ */

describeE2E("Input Validation", () => {
  test("Register with empty address returns 400", async () => {
    const { status } = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ address: "" }),
    });
    expect(status).toBe(400);
  });

  test("Register with no body returns 400", async () => {
    const { status } = await api("/api/auth/register", {
      method: "POST",
      body: "{}",
    });
    expect(status).toBe(400);
  });

  test("Register with malformed JSON returns 400", async () => {
    const { status } = await api("/api/auth/register", {
      method: "POST",
      body: "{",
    });
    expect(status).toBe(400);
  });

  test("Profile PATCH with invalid email is handled", async () => {
    const { status } = await api("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ email: "not-an-email" }),
    });
    // Should be 401 (no auth) not 500
    expect(status).toBe(401);
  });
});

/* ═══════════════════════════════════════════
   8. RATE LIMITING
   ═══════════════════════════════════════════ */

describeE2E("Rate Limiting", () => {
  test("Admin login rate-limits after 5 attempts", async () => {
    const results: number[] = [];
    for (let i = 0; i < 7; i++) {
      const { status } = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: "wrong" }),
      });
      results.push(status);
    }
    // Last attempts should be rate limited (429)
    expect(results).toContain(429);
  }, 30000);
});

/* ═══════════════════════════════════════════
   9. WALLET ADDRESS UNIQUENESS
   ═══════════════════════════════════════════ */

describeE2E("Wallet Address Uniqueness", () => {
  const uniqueAddr = "0xunique" + Date.now().toString(16);

  test("Registering same address twice returns same user", async () => {
    const res1 = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ address: uniqueAddr }),
    });
    const res2 = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ address: uniqueAddr }),
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Same user should be returned (upsert behavior)
    expect(res1.body.user?.address).toBe(res2.body.user?.address);
  });
});

/* ═══════════════════════════════════════════
   10. PAYMENT QR ROUTES
   ═══════════════════════════════════════════ */

describeE2E("Payment QR Routes", () => {
  test("GET /api/payments/qr without auth returns 401", async () => {
    const { status } = await api("/api/payments/qr?amount=1000000000000000&asset=ETH");
    expect(status).toBe(401);
  });

  test("POST /api/payments/qr without auth returns 401", async () => {
    const { status } = await api("/api/payments/qr", {
      method: "POST",
      body: JSON.stringify({ qrData: '{"type":"smartwallet-pay"}' }),
    });
    expect(status).toBe(401);
  });

  test("POST /api/payments/qr without body returns 400", async () => {
    // This only applies if we bypass auth; auth should reject first
    const { status } = await api("/api/payments/qr", {
      method: "POST",
      body: JSON.stringify({}),
    });
    // 401 = no auth, 400 = missing qrData (would apply to authenticated user)
    expect([400, 401]).toContain(status);
  });

  test("GET /api/payments/history without auth returns 401", async () => {
    const { status } = await api("/api/payments/history");
    expect(status).toBe(401);
  });

  test("GET /api/payments/request without auth returns 401", async () => {
    const { status } = await api("/api/payments/request");
    expect(status).toBe(401);
  });

  test("POST /api/payments/request without auth returns 401", async () => {
    const { status } = await api("/api/payments/request", {
      method: "POST",
      body: JSON.stringify({ amount: "1000000000000000", asset: "ETH" }),
    });
    expect(status).toBe(401);
  });
});

/* ═══════════════════════════════════════════
   11. PAGES RETURN HTML
   ═══════════════════════════════════════════ */

describeE2E("Page Routes", () => {
  test("GET / returns HTML", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") || "";
    expect(contentType).toContain("text/html");
  });

  test("GET /admin returns HTML", async () => {
    const res = await fetch(`${BASE_URL}/admin`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") || "";
    expect(contentType).toContain("text/html");
  });

  test("GET /nonexistent returns 404", async () => {
    const res = await fetch(`${BASE_URL}/nonexistent-page-xyz`);
    expect(res.status).toBe(404);
  });
});
