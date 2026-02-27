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
});
