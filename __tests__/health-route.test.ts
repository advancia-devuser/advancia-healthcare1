import { GET } from "@/app/api/health/route";

jest.mock("@/lib/db", () => ({
  prisma: {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

// Suppress logger output during tests
jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() },
}));

describe("Health Check Route", () => {
  test("returns 200 with ok status", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.uptime).toBe("number");
    expect(body.db).toBeDefined();
    expect(body.db.status).toBe("ok");
    expect(typeof body.db.latencyMs).toBe("number");
  });

  test("excludes deployment info when env vars are not set", async () => {
    const res = await GET();
    const body = await res.json();
    // In test env, Vercel env vars are not set
    expect(body.deployment).toBeUndefined();
  });

  test("returns 503 when DB is unreachable", async () => {
    const { prisma } = require("@/lib/db");
    prisma.$queryRawUnsafe.mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.db.status).toBe("error");
  });
});
