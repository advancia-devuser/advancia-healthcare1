import { GET, PATCH, POST } from "@/app/api/subscriptions/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    subscription: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ledger", () => ({
  debitWallet: jest.fn(),
}));

describe("Subscriptions API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
    (prisma.subscription.updateMany as unknown as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n1" });
  });

  test("GET returns user subscriptions", async () => {
    (prisma.subscription.findMany as unknown as jest.Mock).mockResolvedValue([{ id: "s1" }]);

    const req = new Request("http://localhost:3000/api/subscriptions");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  test("POST rejects missing tier", async () => {
    const req = new Request("http://localhost:3000/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid chainId", async () => {
    const req = new Request("http://localhost:3000/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "BASIC", chainId: "bad" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST creates paid subscription and debits wallet", async () => {
    (prisma.subscription.create as unknown as jest.Mock).mockResolvedValue({
      id: "s1",
      userId: "u1",
      tier: "BASIC",
      status: "ACTIVE",
    });

    const req = new Request("http://localhost:3000/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "BASIC", asset: "USDC", chainId: "84532" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(debitWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        asset: "USDC",
        amount: "10000000000000000",
        chainId: 84532,
      })
    );
    expect(prisma.subscription.create).toHaveBeenCalledTimes(1);
  });

  test("POST maps insufficient balance errors to 400", async () => {
    (debitWallet as unknown as jest.Mock).mockRejectedValue(new Error("Insufficient balance"));

    const req = new Request("http://localhost:3000/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "PREMIUM" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  test("PATCH rejects invalid action", async () => {
    const req = new Request("http://localhost:3000/api/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s1", action: "invalid" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when subscription does not exist", async () => {
    (prisma.subscription.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s404", action: "pause" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  test("PATCH normalizes action case and updates status", async () => {
    (prisma.subscription.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "ACTIVE",
    });
    (prisma.subscription.update as unknown as jest.Mock).mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "PAUSED",
    });

    const req = new Request("http://localhost:3000/api/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptionId: "s1", action: "PAUSE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ status: "PAUSED" }),
      })
    );
  });
});
