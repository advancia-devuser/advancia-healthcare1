/**
 * @jest-environment node
 */

// Tests for middleware.ts — cron auth gate & response headers

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Minimal mocks for NextRequest / NextResponse ────────────
const mockNextResponseJson = jest.fn();
const mockNextResponseNext = jest.fn();
const mockNextResponseRewrite = jest.fn();

jest.mock("next/server", () => {
  class FakeHeaders {
    private map = new Map<string, string>();
    get(key: string) { return this.map.get(key.toLowerCase()) ?? null; }
    set(key: string, val: string) { this.map.set(key.toLowerCase(), val); }
    has(key: string) { return this.map.has(key.toLowerCase()); }
  }

  return {
    NextRequest: jest.fn(),
    NextResponse: {
      json: (...args: any[]) => {
        mockNextResponseJson(...args);
        const headers = new FakeHeaders();
        return { type: "json", args, headers };
      },
      next: () => {
        const headers = new FakeHeaders();
        const res = { headers, type: "next" };
        mockNextResponseNext(res);
        return res;
      },
      rewrite: (url: any) => {
        const headers = new FakeHeaders();
        const res = { headers, type: "rewrite", url };
        mockNextResponseRewrite(res);
        return res;
      },
    },
  };
});

// Mock crypto.randomUUID (used in middleware)
const originalCrypto = globalThis.crypto;
beforeAll(() => {
  (globalThis as any).crypto = {
    ...originalCrypto,
    randomUUID: () => "test-uuid-1234",
  };
});
afterAll(() => {
  (globalThis as any).crypto = originalCrypto;
});

// Helper to make a fake NextRequest-like object
function fakeRequest(pathname: string, headers: Record<string, string> = {}): any {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    nextUrl: {
      pathname,
      clone() {
        return { pathname, toString: () => `http://localhost:3000${pathname}` };
      },
    },
    headers: {
      get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────
describe("middleware", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    mockNextResponseJson.mockClear();
    mockNextResponseNext.mockClear();
    mockNextResponseRewrite.mockClear();
  });
  afterAll(() => { process.env = OLD_ENV; });

  function loadMiddleware() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../middleware").middleware;
  }

  // ── Cron gating ───────────────────────────────
  it("blocks cron routes without valid CRON_SECRET", () => {
    process.env.CRON_SECRET = "secret123";
    const mw = loadMiddleware();
    const req = fakeRequest("/api/cron/deposits");

    const res = mw(req);
    expect(mockNextResponseJson).toHaveBeenCalledWith(
      { error: "Unauthorized" },
      { status: 401 },
    );
    expect(res.type).toBe("json");
  });

  it("blocks cron routes with wrong bearer token", () => {
    process.env.CRON_SECRET = "secret123";
    const mw = loadMiddleware();
    const req = fakeRequest("/api/cron/deposits", { authorization: "Bearer wrong" });

    const res = mw(req);
    expect(res.type).toBe("json");
  });

  it("allows cron routes with correct bearer token", () => {
    process.env.CRON_SECRET = "secret123";
    const mw = loadMiddleware();
    const req = fakeRequest("/api/cron/deposits", { authorization: "Bearer secret123" });

    const res = mw(req);
    expect(res.type).toBe("next");
  });

  it("allows cron routes when CRON_SECRET is not set (dev mode)", () => {
    delete process.env.CRON_SECRET;
    const mw = loadMiddleware();
    const req = fakeRequest("/api/cron/deposits");

    const res = mw(req);
    expect(res.type).toBe("next");
  });

  // ── Response headers ──────────────────────────
  it("sets X-Request-Id header on responses", () => {
    delete process.env.CRON_SECRET;
    const mw = loadMiddleware();
    const req = fakeRequest("/api/wallets");

    const res = mw(req);
    expect(res.headers.get("X-Request-Id")).toBe("test-uuid-1234");
  });

  it("preserves incoming X-Request-Id", () => {
    delete process.env.CRON_SECRET;
    const mw = loadMiddleware();
    const req = fakeRequest("/api/wallets", { "x-request-id": "existing-id" });

    const res = mw(req);
    expect(res.headers.get("X-Request-Id")).toBe("existing-id");
  });

  it("adds security headers", () => {
    delete process.env.CRON_SECRET;
    const mw = loadMiddleware();
    const req = fakeRequest("/dashboard");

    const res = mw(req);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  // ── Config matcher export ─────────────────────
  it("exports a config with matcher array", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { config } = require("../middleware");
    expect(config).toBeDefined();
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher.length).toBeGreaterThan(0);
  });

  // ── Auth rate limiting ────────────────────────
  describe("auth rate limiting", () => {
    it("allows auth requests under the limit", () => {
      delete process.env.CRON_SECRET;
      const mw = loadMiddleware();
      const req = fakeRequest("/api/auth/login", { "x-forwarded-for": "10.0.0.1" });

      const res = mw(req);
      expect(res.type).toBe("next");
    });

    it("returns 429 after exceeding the rate limit", () => {
      delete process.env.CRON_SECRET;
      const mw = loadMiddleware();

      // Use a unique IP to avoid interference from other tests
      const ip = "10.0.0.99";

      // Fire 20 requests (the limit)
      for (let i = 0; i < 20; i++) {
        const req = fakeRequest("/api/auth/login", { "x-forwarded-for": ip });
        const res = mw(req);
        expect(res.type).toBe("next");
      }

      // 21st request should be rate-limited
      const req = fakeRequest("/api/auth/login", { "x-forwarded-for": ip });
      const res = mw(req);
      expect(res.type).toBe("json");
      expect(mockNextResponseJson).toHaveBeenCalledWith(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    });

    it("does not rate-limit non-auth API routes", () => {
      delete process.env.CRON_SECRET;
      const mw = loadMiddleware();
      const ip = "10.0.0.50";

      // Fire 25 requests on a non-auth route — should all pass
      for (let i = 0; i < 25; i++) {
        const req = fakeRequest("/api/wallets", { "x-forwarded-for": ip });
        const res = mw(req);
        expect(res.type).toBe("next");
      }
    });
  });

  // ── API versioning ────────────────────────────
  describe("API versioning", () => {
    it("rewrites /api/v1/* to /api/*", () => {
      delete process.env.CRON_SECRET;
      const mw = loadMiddleware();
      const req = fakeRequest("/api/v1/wallets");

      const res = mw(req);
      expect(res.type).toBe("rewrite");
      expect(res.url.pathname).toBe("/api/wallets");
    });

    it("rewrites nested /api/v1/ paths correctly", () => {
      delete process.env.CRON_SECRET;
      const mw = loadMiddleware();
      const req = fakeRequest("/api/v1/health/cards");

      const res = mw(req);
      expect(res.type).toBe("rewrite");
      expect(res.url.pathname).toBe("/api/health/cards");
    });

    it("does not rewrite plain /api/* paths", () => {
      delete process.env.CRON_SECRET;
      const mw = loadMiddleware();
      const req = fakeRequest("/api/wallets");

      const res = mw(req);
      expect(res.type).toBe("next");
    });

    it("adds X-API-Version header on API responses", () => {
      delete process.env.CRON_SECRET;
      const mw = loadMiddleware();
      const req = fakeRequest("/api/wallets");

      const res = mw(req);
      expect(res.headers.get("X-API-Version")).toBe("v1");
    });

    it("does not add X-API-Version on non-API routes", () => {
      delete process.env.CRON_SECRET;
      const mw = loadMiddleware();
      const req = fakeRequest("/dashboard");

      const res = mw(req);
      expect(res.headers.get("X-API-Version")).toBeNull();
    });
  });
});
