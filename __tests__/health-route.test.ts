import { GET } from "@/app/api/health/route";

describe("Health Check Route", () => {
  test("returns 200 with ok status", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.uptime).toBe("number");
  });

  test("excludes deployment info when env vars are not set", async () => {
    const res = await GET();
    const body = await res.json();
    // In test env, Vercel env vars are not set
    expect(body.deployment).toBeUndefined();
  });
});
