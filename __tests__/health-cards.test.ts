import { createMocks } from "node-mocks-http";
import { DELETE, GET, PATCH, POST } from "@/app/api/health/cards/route";
import { prisma } from "@/lib/db";
import { signUserToken } from "@/lib/auth";
import { encryptJSON } from "@/lib/crypto";

// Mock the database
jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    healthCard: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

describe("Health Cards API", () => {
  const mockUserId = "user-123";
  const mockAddress = "0x1234567890123456789012345678901234567890";
  let validToken: string;

  beforeAll(async () => {
    validToken = await signUserToken(mockUserId, mockAddress);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: mockUserId,
      address: mockAddress,
      status: "APPROVED",
    });
  });

  describe("GET /api/health/cards", () => {
    it("should return 401 if no token is provided", async () => {
      const { req } = createMocks({
        method: "GET",
        url: "http://localhost:3000/api/health/cards",
      });

      const response = await GET(req as any);
      expect(response.status).toBe(401);
    });

    it("should return a list of decrypted health cards", async () => {
      const mockCards = [
        {
          id: "card-1",
          userId: mockUserId,
          providerName: "BlueCross",
          cardType: "INSURANCE",
          encryptedData: encryptJSON({ memberId: "12345" }),
          status: "ACTIVE",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.healthCard.findMany as jest.Mock).mockResolvedValue(mockCards);

      const { req } = createMocks({
        method: "GET",
        url: "http://localhost:3000/api/health/cards",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      const response = await GET(req as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cards).toHaveLength(1);
      expect(data.cards[0].providerName).toBe("BlueCross");
      expect(data.cards[0].cardData).toEqual({ memberId: "12345" });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "HEALTH_CARDS_ACCESSED",
          }),
        })
      );
    });

    it("should return 400 for invalid status filter", async () => {
      const { req } = createMocks({
        method: "GET",
        url: "http://localhost:3000/api/health/cards?status=BAD",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      const response = await GET(req as any);

      expect(response.status).toBe(400);
      expect(prisma.healthCard.findMany).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/health/cards", () => {
    it("should create a new health card and encrypt the data", async () => {
      const payload = {
        providerName: "Aetna",
        cardType: "INSURANCE",
        cardData: { policyNumber: "98765" },
      };

      (prisma.healthCard.create as jest.Mock).mockResolvedValue({
        id: "card-2",
        ...payload,
        encryptedData: "mock-encrypted-string",
      });

      const { req } = createMocks({
        method: "POST",
        url: "http://localhost:3000/api/health/cards",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        body: payload,
      });

      // Mock the json() method on the request object
      (req as any).json = jest.fn().mockResolvedValue(payload);

      const response = await POST(req as any);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.card.providerName).toBe("Aetna");
      expect(prisma.healthCard.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            providerName: "Aetna",
            cardType: "INSURANCE",
            encryptedData: expect.any(String),
          }),
        })
      );
    });

    it("should return 400 when required fields are missing", async () => {
      const payload = {
        providerName: "Aetna",
      };

      const { req } = createMocks({
        method: "POST",
        url: "http://localhost:3000/api/health/cards",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        body: payload,
      });

      (req as any).json = jest.fn().mockResolvedValue(payload);

      const response = await POST(req as any);

      expect(response.status).toBe(400);
      expect(prisma.healthCard.create).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid expiresAt", async () => {
      const payload = {
        providerName: "Aetna",
        cardType: "INSURANCE",
        cardData: { policyNumber: "98765" },
        expiresAt: "not-a-date",
      };

      const { req } = createMocks({
        method: "POST",
        url: "http://localhost:3000/api/health/cards",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        body: payload,
      });

      (req as any).json = jest.fn().mockResolvedValue(payload);

      const response = await POST(req as any);

      expect(response.status).toBe(400);
      expect(prisma.healthCard.create).not.toHaveBeenCalled();
    });

    it("should return 500 on unexpected database errors", async () => {
      const payload = {
        providerName: "Aetna",
        cardType: "INSURANCE",
        cardData: { policyNumber: "98765" },
      };

      (prisma.healthCard.create as jest.Mock).mockRejectedValue(new Error("db down"));

      const { req } = createMocks({
        method: "POST",
        url: "http://localhost:3000/api/health/cards",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        body: payload,
      });

      (req as any).json = jest.fn().mockResolvedValue(payload);

      const response = await POST(req as any);

      expect(response.status).toBe(500);
    });
  });

  describe("PATCH /api/health/cards", () => {
    it("should return 400 when cardId is missing", async () => {
      const payload = { providerName: "Updated" };

      const { req } = createMocks({
        method: "PATCH",
        url: "http://localhost:3000/api/health/cards",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        body: payload,
      });

      (req as any).json = jest.fn().mockResolvedValue(payload);

      const response = await PATCH(req as any);

      expect(response.status).toBe(400);
      expect(prisma.healthCard.findFirst).not.toHaveBeenCalled();
    });

    it("should return 404 when card is not found", async () => {
      (prisma.healthCard.findFirst as jest.Mock).mockResolvedValue(null);
      const payload = { cardId: "missing", providerName: "Updated" };

      const { req } = createMocks({
        method: "PATCH",
        url: "http://localhost:3000/api/health/cards",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        body: payload,
      });

      (req as any).json = jest.fn().mockResolvedValue(payload);

      const response = await PATCH(req as any);

      expect(response.status).toBe(404);
      expect(prisma.healthCard.update).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/health/cards", () => {
    it("should return 400 when cardId query param is missing", async () => {
      const { req } = createMocks({
        method: "DELETE",
        url: "http://localhost:3000/api/health/cards",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      const response = await DELETE(req as any);

      expect(response.status).toBe(400);
      expect(prisma.healthCard.findFirst).not.toHaveBeenCalled();
    });

    it("should return 500 on unexpected delete errors", async () => {
      (prisma.healthCard.findFirst as jest.Mock).mockRejectedValue(new Error("db down"));

      const { req } = createMocks({
        method: "DELETE",
        url: "http://localhost:3000/api/health/cards?cardId=c1",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      const response = await DELETE(req as any);

      expect(response.status).toBe(500);
    });
  });
});
