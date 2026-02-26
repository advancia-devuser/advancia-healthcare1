import { GET, POST, PATCH } from "@/app/api/health/cards/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptJSON, encryptJSON } from "@/lib/crypto";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    healthCard: {
      findMany: jest.fn(),
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

jest.mock("@/lib/crypto", () => ({
  encryptJSON: jest.fn(),
  decryptJSON: jest.fn(),
}));

describe("Health Cards Route", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
    (decryptJSON as unknown as jest.Mock).mockReturnValue({ memberId: "m1" });
    (encryptJSON as unknown as jest.Mock).mockReturnValue("encrypted-json");
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n1" });
  });

  test("GET returns 400 for invalid status filter", async () => {
    const req = new Request("http://localhost:3000/api/health/cards?status=bad");

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.healthCard.findMany).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/health/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.healthCard.create).not.toHaveBeenCalled();
  });

  test("POST returns 400 for invalid expiresAt", async () => {
    const req = new Request("http://localhost:3000/api/health/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerName: "Aetna",
        cardType: "insurance",
        cardData: { memberId: "x1" },
        expiresAt: "not-a-date",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.healthCard.create).not.toHaveBeenCalled();
  });

  test("POST creates card with normalized cardType", async () => {
    (prisma.healthCard.create as unknown as jest.Mock).mockResolvedValue({
      id: "c1",
      providerName: "Aetna",
      cardType: "INSURANCE",
      status: "ACTIVE",
      expiresAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const req = new Request("http://localhost:3000/api/health/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerName: "Aetna",
        cardType: " insurance ",
        cardData: { memberId: "x1" },
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(prisma.healthCard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          providerName: "Aetna",
          cardType: "INSURANCE",
          encryptedData: "encrypted-json",
        }),
      })
    );
  });

  test("PATCH returns 400 for invalid status", async () => {
    (prisma.healthCard.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "c1",
      userId: "u1",
    });

    const req = new Request("http://localhost:3000/api/health/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c1", status: "BROKEN" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.healthCard.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed cardData string", async () => {
    (prisma.healthCard.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "c1",
      userId: "u1",
    });

    const req = new Request("http://localhost:3000/api/health/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c1", cardData: "{" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.healthCard.update).not.toHaveBeenCalled();
  });
});
