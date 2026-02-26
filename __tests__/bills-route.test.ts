import { GET, POST } from "@/app/api/bills/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    billPayment: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
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

describe("Bills API", () => {
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
    const req = new Request("http://localhost:3000/api/bills?status=BAD");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.billPayment.findMany).not.toHaveBeenCalled();
  });

  test("GET uses safe pagination defaults", async () => {
    (prisma.billPayment.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.billPayment.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/bills?page=abc&limit=-1");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.billPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  test("POST rejects invalid amount", async () => {
    const req = new Request("http://localhost:3000/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billerName: "Power", accountNumber: "123", amount: "10.5" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST rejects invalid chainId", async () => {
    const req = new Request("http://localhost:3000/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billerName: "Power", accountNumber: "123", amount: "10", chainId: "bad" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST creates immediate paid bill and debits wallet", async () => {
    (prisma.billPayment.create as unknown as jest.Mock).mockResolvedValue({ id: "b1", status: "PAID" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n1" });

    const req = new Request("http://localhost:3000/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billerName: "  Power Co  ",
        accountNumber: " 123456 ",
        amount: 100,
        asset: "usdc",
        chainId: "84532",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(debitWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        asset: "usdc",
        amount: "100",
        chainId: 84532,
      })
    );
    expect(prisma.billPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billerName: "Power Co",
          accountNumber: "123456",
          amount: "100",
          asset: "usdc",
          status: "PAID",
        }),
      })
    );
  });

  test("POST schedules future bill without debiting wallet", async () => {
    (prisma.billPayment.create as unknown as jest.Mock).mockResolvedValue({ id: "b2", status: "SCHEDULED" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a2" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n2" });

    const future = new Date(Date.now() + 3600_000).toISOString();
    const req = new Request("http://localhost:3000/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billerName: "Water",
        accountNumber: "999",
        amount: "50",
        scheduledFor: future,
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(debitWallet).not.toHaveBeenCalled();
    expect(prisma.billPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SCHEDULED" }) })
    );
  });

  test("POST maps insufficient balance errors to 400", async () => {
    (debitWallet as unknown as jest.Mock).mockRejectedValue(new Error("Insufficient balance"));

    const req = new Request("http://localhost:3000/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billerName: "Power", accountNumber: "123", amount: "10" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});
