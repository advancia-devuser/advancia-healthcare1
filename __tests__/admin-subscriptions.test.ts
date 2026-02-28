import { GET, PATCH } from "@/app/api/admin/subscriptions/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    subscription: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe("Admin Subscriptions API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
  });

  test("GET returns 403 for non-admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(403);
  });

  test("GET returns 500 when query fails", async () => {
    (prisma.subscription.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(500);
  });

  test("GET returns subscriptions with summary counts", async () => {
    (prisma.subscription.findMany as unknown as jest.Mock).mockResolvedValue([
      { id: "s1", status: "ACTIVE", tier: "FREE" },
      { id: "s2", status: "ACTIVE", tier: "BASIC" },
      { id: "s3", status: "ACTIVE", tier: "PREMIUM" },
      { id: "s4", status: "PAUSED", tier: "ENTERPRISE" },
      { id: "s5", status: "CANCELLED", tier: "BASIC" },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary).toEqual({
      total: 5,
      active: 3,
      byTier: {
        FREE: 1,
        BASIC: 1,
        PREMIUM: 1,
        ENTERPRISE: 0,
      },
    });
  });

  test("PATCH rejects invalid action", async () => {
    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s1", action: "INVALID" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH returns 403 for non-admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s1", action: "PAUSE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH rejects missing subscriptionId", async () => {
    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "PAUSE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH rejects invalid tier for UPGRADE", async () => {
    (prisma.subscription.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "ACTIVE",
      tier: "BASIC",
    });

    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s1", action: "UPGRADE", tier: "GOLD" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when subscription is missing", async () => {
    (prisma.subscription.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "missing", action: "PAUSE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  test("PATCH upgrades subscription and writes audit log", async () => {
    (prisma.subscription.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "ACTIVE",
      tier: "BASIC",
    });

    (prisma.subscription.update as unknown as jest.Mock).mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "ACTIVE",
      tier: "PREMIUM",
    });

    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s1", action: "UPGRADE", tier: "PREMIUM" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ tier: "PREMIUM" }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("PATCH trims subscriptionId before lookup", async () => {
    (prisma.subscription.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "s-trim",
      userId: "u1",
      status: "ACTIVE",
      tier: "BASIC",
    });

    (prisma.subscription.update as unknown as jest.Mock).mockResolvedValue({
      id: "s-trim",
      userId: "u1",
      status: "PAUSED",
      tier: "BASIC",
    });

    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "  s-trim  ", action: "PAUSE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.subscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s-trim" } })
    );
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s-trim" } })
    );
  });

  test("PATCH applies CANCEL action with cancelledAt", async () => {
    (prisma.subscription.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "s2",
      userId: "u1",
      status: "ACTIVE",
      tier: "PREMIUM",
    });

    (prisma.subscription.update as unknown as jest.Mock).mockResolvedValue({
      id: "s2",
      status: "CANCELLED",
      tier: "PREMIUM",
    });

    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s2", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELLED",
          cancelledAt: expect.any(Date),
        }),
      })
    );
  });

  test("PATCH applies RESUME action", async () => {
    (prisma.subscription.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "s3",
      userId: "u1",
      status: "PAUSED",
      tier: "BASIC",
    });

    (prisma.subscription.update as unknown as jest.Mock).mockResolvedValue({
      id: "s3",
      status: "ACTIVE",
      tier: "BASIC",
    });

    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s3", action: "RESUME" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
  });

  test("PATCH returns 500 on unexpected errors", async () => {
    (prisma.subscription.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "ACTIVE",
      tier: "BASIC",
    });
    (prisma.subscription.update as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/admin/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s1", action: "PAUSE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(500);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
