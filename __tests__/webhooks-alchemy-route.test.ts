/**
 * Tests for GET / POST  /api/webhooks/alchemy
 */

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
  },
}));

import { GET, POST } from "@/app/api/webhooks/alchemy/route";

const REAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...REAL_ENV, ALCHEMY_WEBHOOK_SECRET: "test-secret" };
});

afterAll(() => {
  process.env = REAL_ENV;
});

/* ────────── GET: Health ────────── */
describe("GET /api/webhooks/alchemy", () => {
  it("returns 200 with active message", async () => {
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.message).toContain("active");
  });
});

/* ────────── POST: Webhook ────────── */
describe("POST /api/webhooks/alchemy", () => {
  function makeReq(body: any, token?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["x-alchemy-token"] = token;
    return new Request("http://localhost/api/webhooks/alchemy", {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    });
  }

  it("returns 500 when ALCHEMY_WEBHOOK_SECRET is not set", async () => {
    delete process.env.ALCHEMY_WEBHOOK_SECRET;
    const res = await POST(makeReq({ event: {} }, "any"));
    expect(res.status).toBe(500);
  });

  it("returns 401 when x-alchemy-token is missing", async () => {
    const res = await POST(makeReq({ event: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when x-alchemy-token is wrong", async () => {
    const res = await POST(makeReq({ event: {} }, "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid token and body", async () => {
    const res = await POST(makeReq({ event: { activity: [] } }, "test-secret"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("returns 500 when body parsing fails", async () => {
    const req = new Request("http://localhost/api/webhooks/alchemy", {
      method: "POST",
      body: "not-json",
      headers: {
        "Content-Type": "text/plain",
        "x-alchemy-token": "test-secret",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
