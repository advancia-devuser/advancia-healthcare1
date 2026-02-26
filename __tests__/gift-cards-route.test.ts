import { GET, PATCH, POST } from "@/app/api/gift-cards/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    giftCard: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ledger", () => ({
  debitWallet: jest.fn(),
}));

describe("Gift Cards API", () => {
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
    const req = new Request("http://localhost:3000/api/gift-cards?status=invalid");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.giftCard.findMany).not.toHaveBeenCalled();
  });

  test("GET filters by valid status", async () => {
    (prisma.giftCard.findMany as unknown as jest.Mock).mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/gift-cards?status=active");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.giftCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", status: "ACTIVE" } })
    );
  });

  test("POST rejects invalid initial value", async () => {
    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantName: "Amazon", initialValue: "10.5" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST rejects invalid chainId", async () => {
    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantName: "Amazon", initialValue: "100", chainId: "bad" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("POST creates gift card and notifies user", async () => {
    (prisma.giftCard.create as unknown as jest.Mock).mockResolvedValue({ id: "gc1" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n1" });

    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantName: "  Amazon  ",
        initialValue: 100,
        currency: "usd",
        chainId: "84532",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(debitWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        amount: "100",
        chainId: 84532,
        meta: expect.objectContaining({ merchantName: "Amazon" }),
      })
    );
    expect(prisma.giftCard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          merchantName: "Amazon",
          initialValue: "100",
          currentValue: "100",
          currency: "USD",
        }),
      })
    );
  });

  test("POST maps insufficient balance errors to 400", async () => {
    (debitWallet as unknown as jest.Mock).mockRejectedValue(new Error("Insufficient balance"));

    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantName: "Amazon", initialValue: "100" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  test("PATCH rejects zero redeem amount", async () => {
    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "gc1", redeemAmount: "0" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.giftCard.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.giftCard.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when card is missing", async () => {
    (prisma.giftCard.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "missing", redeemAmount: "5" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.giftCard.update).not.toHaveBeenCalled();
  });

  test("PATCH rejects redeem amount above current value", async () => {
    (prisma.giftCard.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "gc1",
      currentValue: "10",
      status: "ACTIVE",
    });

    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "gc1", redeemAmount: "50" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.giftCard.update).not.toHaveBeenCalled();
  });

  test("PATCH updates card value and status", async () => {
    (prisma.giftCard.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "gc1",
      currentValue: "10",
      status: "ACTIVE",
    });
    (prisma.giftCard.update as unknown as jest.Mock).mockResolvedValue({
      id: "gc1",
      currentValue: "0",
      status: "REDEEMED",
    });

    const req = new Request("http://localhost:3000/api/gift-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: " gc1 ", redeemAmount: "10" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.giftCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "gc1" },
        data: expect.objectContaining({ currentValue: "0", status: "REDEEMED" }),
      })
    );
  });
});
