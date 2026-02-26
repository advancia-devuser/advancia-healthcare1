import { GET, POST } from "@/app/api/health/transactions/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    healthTransaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    healthCard: {
      findFirst: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ledger", () => ({
  debitWallet: jest.fn(),
}));

describe("Health Transactions API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET rejects invalid status filter", async () => {
    const req = new Request("http://localhost:3000/api/health/transactions?status=bad");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.healthTransaction.findMany).not.toHaveBeenCalled();
  });

  test("GET uses safe pagination defaults", async () => {
    (prisma.healthTransaction.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.healthTransaction.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/health/transactions?page=abc&limit=-1");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.healthTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    );
  });

  test("POST rejects invalid amount format", async () => {
    const req = new Request("http://localhost:3000/api/health/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "10.5", description: "Bill" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.healthTransaction.create).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/health/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.healthTransaction.create).not.toHaveBeenCalled();
  });

  test("POST returns 404 when health card is missing", async () => {
    (prisma.healthCard.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/health/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ healthCardId: "missing", amount: "100", description: "Bill" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(prisma.healthTransaction.create).not.toHaveBeenCalled();
  });

  test("POST returns 404 when wallet is missing", async () => {
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/health/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "100", description: "Bill" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(prisma.healthTransaction.create).not.toHaveBeenCalled();
  });

  test("POST maps insufficient balance errors to 400 and marks failed", async () => {
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({
      userId: "u1",
      chainId: 421614,
      smartAccountAddress: "0xwallet",
    });
    (prisma.healthTransaction.create as unknown as jest.Mock).mockResolvedValue({ id: "ht1" });
    (debitWallet as unknown as jest.Mock).mockRejectedValue(new Error("Insufficient balance"));
    (prisma.healthTransaction.update as unknown as jest.Mock).mockResolvedValue({ id: "ht1", status: "FAILED" });

    const req = new Request("http://localhost:3000/api/health/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "100", description: "Bill" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.healthTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ht1" }, data: { status: "FAILED" } })
    );
  });

  test("POST completes successful payment flow", async () => {
    (prisma.healthCard.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "hc1",
      userId: "u1",
      status: "ACTIVE",
    });
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({
      userId: "u1",
      chainId: 421614,
      smartAccountAddress: "0xwallet",
    });
    (prisma.healthTransaction.create as unknown as jest.Mock).mockResolvedValue({ id: "ht1", status: "PENDING" });
    (debitWallet as unknown as jest.Mock).mockResolvedValue({});
    (prisma.healthTransaction.update as unknown as jest.Mock).mockResolvedValue({ id: "ht1", status: "COMPLETED" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n1" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });

    const req = new Request("http://localhost:3000/api/health/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        healthCardId: " hc1 ",
        amount: "100",
        description: "  Medical bill ",
        currency: " usd ",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.healthTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          healthCardId: "hc1",
          amount: "100",
          description: "Medical bill",
          currency: "usd",
          status: "PENDING",
        }),
      })
    );
    expect(debitWallet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", amount: "100", chainId: 421614 })
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
