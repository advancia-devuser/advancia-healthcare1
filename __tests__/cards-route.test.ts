import { GET, PATCH, POST } from "@/app/api/cards/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    cardRequest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
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

describe("Cards API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET returns cards for approved user", async () => {
    (prisma.cardRequest.findMany as unknown as jest.Mock).mockResolvedValue([{ id: "c1" }]);

    const req = new Request("http://localhost:3000/api/cards");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.cardRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  test("POST rejects invalid card type", async () => {
    const req = new Request("http://localhost:3000/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardType: "metal" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.cardRequest.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid spendingLimit format", async () => {
    const req = new Request("http://localhost:3000/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardType: "VIRTUAL", spendingLimit: "10.5" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.cardRequest.create).not.toHaveBeenCalled();
  });

  test("POST requires physical delivery fields", async () => {
    const req = new Request("http://localhost:3000/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardType: "PHYSICAL", deliveryName: "Jane" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.cardRequest.create).not.toHaveBeenCalled();
  });

  test("POST returns 409 when pending card exists", async () => {
    (prisma.cardRequest.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "existing" });

    const req = new Request("http://localhost:3000/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardType: "virtual" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    expect(prisma.cardRequest.create).not.toHaveBeenCalled();
  });

  test("POST creates physical card with normalized fields", async () => {
    (prisma.cardRequest.findFirst as unknown as jest.Mock).mockResolvedValue(null);
    (prisma.cardRequest.create as unknown as jest.Mock).mockResolvedValue({ id: "c1", cardType: "PHYSICAL" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n1" });

    const req = new Request("http://localhost:3000/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardType: "physical",
        design: "  BLACK  ",
        currency: "eur",
        spendingLimit: 5000,
        deliveryName: " Jane Doe ",
        deliveryAddress: " 123 Main ",
        deliveryCity: " New York ",
        deliveryState: " NY ",
        deliveryZip: " 10001 ",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(prisma.cardRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cardType: "PHYSICAL",
          design: "BLACK",
          currency: "EUR",
          spendingLimit: "5000",
          deliveryName: "Jane Doe",
          deliveryCity: "New York",
        }),
      })
    );
  });

  test("PATCH rejects invalid action", async () => {
    const req = new Request("http://localhost:3000/api/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c1", action: "block" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.cardRequest.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.cardRequest.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH cancels only pending cards", async () => {
    (prisma.cardRequest.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "c1",
      userId: "u1",
      status: "APPROVED",
    });

    const req = new Request("http://localhost:3000/api/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c1", action: "cancel" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.cardRequest.update).not.toHaveBeenCalled();
  });

  test("PATCH freezes card with case-insensitive action", async () => {
    (prisma.cardRequest.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "c1",
      userId: "u1",
      status: "PENDING",
    });
    (prisma.cardRequest.update as unknown as jest.Mock).mockResolvedValue({
      id: "c1",
      frozenAt: new Date(),
    });

    const req = new Request("http://localhost:3000/api/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c1", action: "freeze" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.cardRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({ frozenAt: expect.any(Date) }),
      })
    );
  });
});
