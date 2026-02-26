import { GET, POST } from "@/app/api/withdrawals/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyUserPin } from "@/lib/pin-verify";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    withdrawal: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/pin-verify", () => ({
  verifyUserPin: jest.fn(async () => null),
}));

describe("Withdrawals API", () => {
  const mockUser = { id: "u1", address: "0xabc" };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(mockUser);
    (verifyUserPin as unknown as jest.Mock).mockResolvedValue(null);
  });

  test("GET falls back to defaults when page/limit are invalid", async () => {
    (prisma.withdrawal.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.withdrawal.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/withdrawals?page=abc&limit=-5");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.withdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    );
  });

  test("POST rejects non-positive amount", async () => {
    const req = new Request("http://localhost:3000/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "0", toAddress: "0x1", chainId: 1, pin: "1234" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.withdrawal.create).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.withdrawal.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid chainId", async () => {
    const req = new Request("http://localhost:3000/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "1.5", toAddress: "0x1", chainId: "abc", pin: "1234" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.withdrawal.create).not.toHaveBeenCalled();
  });

  test("POST rejects empty toAddress", async () => {
    const req = new Request("http://localhost:3000/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "1", toAddress: "   ", chainId: 1, pin: "1234" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.withdrawal.create).not.toHaveBeenCalled();
  });

  test("POST creates withdrawal when payload is valid", async () => {
    (prisma.withdrawal.create as unknown as jest.Mock).mockResolvedValue({ id: "w1", userId: "u1" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "1.25", asset: "ETH", toAddress: " 0x123 ", chainId: "10", pin: "1234" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(prisma.withdrawal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          amount: "1.25",
          asset: "ETH",
          toAddress: "0x123",
          chainId: 10,
        }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("POST normalizes amount before persistence", async () => {
    (prisma.withdrawal.create as unknown as jest.Mock).mockResolvedValue({ id: "w2", userId: "u1" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/withdrawals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: " 2.50 ", asset: "ETH", toAddress: "0xabc", chainId: 1, pin: "1234" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(prisma.withdrawal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: "2.50",
        }),
      })
    );
  });
});
