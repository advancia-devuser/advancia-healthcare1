import { GET, POST, PATCH } from "@/app/api/admin/wallet/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    adminWallet: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    adminTransaction: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    subscription: {
      count: jest.fn(),
    },
    booking: {
      count: jest.fn(),
    },
  },
}));

describe("Admin Wallet API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
  });

  test("GET returns 403 when not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(403);
  });

  test("GET returns 500 when wallet query fails", async () => {
    (prisma.adminWallet.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(500);
  });

  test("POST returns 403 when not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "1" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(prisma.adminWallet.upsert).not.toHaveBeenCalled();
  });

  test("POST rejects invalid amount format", async () => {
    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "1.5" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.adminWallet.upsert).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.adminWallet.upsert).not.toHaveBeenCalled();
  });

  test("POST rejects empty address", async () => {
    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "5", address: "   " }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.adminWallet.upsert).not.toHaveBeenCalled();
  });

  test("POST creates wallet without credit transaction when amount is omitted", async () => {
    (prisma.adminWallet.findFirst as unknown as jest.Mock).mockResolvedValue(null);
    (prisma.adminWallet.upsert as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      label: "Platform Treasury",
      asset: "ETH",
      balance: "0",
    });

    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.adminWallet.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.adminTransaction.create).not.toHaveBeenCalled();
  });

  test("POST credits wallet and writes CREDIT transaction", async () => {
    (prisma.adminWallet.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      label: "Platform Treasury",
      asset: "ETH",
      balance: "100",
    });

    (prisma.adminWallet.upsert as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      label: "Platform Treasury",
      asset: "ETH",
      balance: "150",
    });

    (prisma.adminTransaction.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "50" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.adminWallet.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.adminTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          asset: "ETH",
          amount: "50",
          type: "CREDIT",
        }),
      })
    );
  });

  test("PATCH rejects non-positive amount", async () => {
    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "0" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.adminWallet.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 403 when not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "1" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect(prisma.adminWallet.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.adminWallet.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH rejects empty reference", async () => {
    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "10", reference: "   " }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.adminWallet.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when wallet is missing", async () => {
    (prisma.adminWallet.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "10" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.adminWallet.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for insufficient balance", async () => {
    (prisma.adminWallet.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      label: "Platform Treasury",
      asset: "ETH",
      balance: "5",
    });

    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "10" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.adminWallet.update).not.toHaveBeenCalled();
  });

  test("PATCH debits wallet and writes DEBIT transaction", async () => {
    (prisma.adminWallet.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      label: "Platform Treasury",
      asset: "ETH",
      balance: "100",
    });

    (prisma.adminWallet.update as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      balance: "70",
    });

    (prisma.adminTransaction.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/wallet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "ETH", amount: "30", description: "Payout" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.adminWallet.update).toHaveBeenCalledTimes(1);
    expect(prisma.adminTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "DEBIT",
          amount: "30",
          description: "Payout",
        }),
      })
    );
  });
});
