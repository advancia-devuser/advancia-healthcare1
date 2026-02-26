import { GET, POST } from "@/app/api/conversions/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { creditWallet, debitWallet } from "@/lib/ledger";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    conversion: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ledger", () => ({
  debitWallet: jest.fn(),
  creditWallet: jest.fn(),
}));

describe("Conversions API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET falls back to safe pagination defaults", async () => {
    (prisma.conversion.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.conversion.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/conversions?page=abc&limit=-5");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.conversion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  test("POST rejects same from/to asset", async () => {
    const req = new Request("http://localhost:3000/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAsset: "ETH", toAsset: "eth", fromAmount: "100", chainId: 421614 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST rejects invalid amount format", async () => {
    const req = new Request("http://localhost:3000/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAsset: "ETH", toAsset: "USDC", fromAmount: "1.5", chainId: 421614 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST returns 400 when quote API returns no quote", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "quote unavailable" }),
    } as never);

    const req = new Request("http://localhost:3000/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAsset: "ETH", toAsset: "USDC", fromAmount: "100", chainId: 421614 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST returns 400 when quote payload is malformed", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ quote: { toAmount: "0", rate: "99", fee: "10", source: "mock" } }),
    } as never);

    const req = new Request("http://localhost:3000/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAsset: "ETH", toAsset: "USDC", fromAmount: "100", chainId: 421614 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST performs conversion and writes audit log", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        quote: {
          toAmount: "9900",
          rate: "99",
          fee: "10",
          source: "mock-aggregator",
        },
      }),
    } as never);

    (prisma.conversion.create as unknown as jest.Mock).mockResolvedValue({ id: "c1" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });

    const req = new Request("http://localhost:3000/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAsset: "eth", toAsset: "usdc", fromAmount: "100", chainId: "84532" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(debitWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        asset: "ETH",
        amount: "100",
        chainId: 84532,
      })
    );
    expect(creditWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        asset: "USDC",
        amount: "9900",
        chainId: 84532,
      })
    );
    expect(prisma.conversion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromAsset: "ETH",
          toAsset: "USDC",
          fromAmount: "100",
          toAmount: "9900",
          chainId: 84532,
        }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
