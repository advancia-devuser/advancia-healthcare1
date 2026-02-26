import { DELETE, GET, PATCH, POST } from "@/app/api/loyalty-cards/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    loyaltyCard: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

describe("Loyalty Cards API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET returns cards for user", async () => {
    (prisma.loyaltyCard.findMany as unknown as jest.Mock).mockResolvedValue([{ id: "lc1" }]);

    const req = new Request("http://localhost:3000/api/loyalty-cards");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.loyaltyCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  test("POST rejects invalid pointsBalance", async () => {
    const req = new Request("http://localhost:3000/api/loyalty-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantName: "Store", cardNumber: "1234", pointsBalance: "12.5" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.loyaltyCard.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid expiresAt date", async () => {
    const req = new Request("http://localhost:3000/api/loyalty-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantName: "Store", cardNumber: "1234", expiresAt: "bad-date" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.loyaltyCard.create).not.toHaveBeenCalled();
  });

  test("POST creates card with normalized fields", async () => {
    (prisma.loyaltyCard.create as unknown as jest.Mock).mockResolvedValue({ id: "lc1" });

    const req = new Request("http://localhost:3000/api/loyalty-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantName: "  Store  ",
        cardNumber: " 1234 ",
        barcode: " 98765 ",
        pointsBalance: 200,
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(prisma.loyaltyCard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          merchantName: "Store",
          cardNumber: "1234",
          barcode: "98765",
          pointsBalance: "200",
        }),
      })
    );
  });

  test("PATCH requires at least one updatable field", async () => {
    (prisma.loyaltyCard.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "lc1", userId: "u1" });

    const req = new Request("http://localhost:3000/api/loyalty-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "lc1" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.loyaltyCard.update).not.toHaveBeenCalled();
  });

  test("PATCH rejects invalid pointsBalance", async () => {
    const req = new Request("http://localhost:3000/api/loyalty-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "lc1", pointsBalance: "abc" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.loyaltyCard.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when card is missing", async () => {
    (prisma.loyaltyCard.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/loyalty-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "missing", pointsBalance: "100" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.loyaltyCard.update).not.toHaveBeenCalled();
  });

  test("PATCH updates card fields", async () => {
    (prisma.loyaltyCard.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "lc1", userId: "u1" });
    (prisma.loyaltyCard.update as unknown as jest.Mock).mockResolvedValue({ id: "lc1" });

    const req = new Request("http://localhost:3000/api/loyalty-cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: " lc1 ",
        pointsBalance: "150",
        merchantName: " Updated Store ",
        cardNumber: " 9999 ",
      }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.loyaltyCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lc1" },
        data: expect.objectContaining({
          pointsBalance: "150",
          merchantName: "Updated Store",
          cardNumber: "9999",
        }),
      })
    );
  });

  test("DELETE rejects missing cardId", async () => {
    const req = new Request("http://localhost:3000/api/loyalty-cards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.loyaltyCard.deleteMany).not.toHaveBeenCalled();
  });

  test("DELETE removes only user card", async () => {
    (prisma.loyaltyCard.deleteMany as unknown as jest.Mock).mockResolvedValue({ count: 1 });

    const req = new Request("http://localhost:3000/api/loyalty-cards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: " lc1 " }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(prisma.loyaltyCard.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lc1", userId: "u1" } })
    );
  });
});
