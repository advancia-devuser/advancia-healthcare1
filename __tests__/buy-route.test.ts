import { GET, POST } from "@/app/api/buy/route";
import { getAuthUser, checkRateLimitPersistent, getClientIP } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth", () => ({
  getAuthUser: jest.fn(),
  checkRateLimitPersistent: jest.fn().mockResolvedValue(true),
  getClientIP: jest.fn().mockReturnValue("127.0.0.1"),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    cryptoOrder: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

const makeReq = (method: string, body?: any) => {
  const url = "http://localhost:3000/api/buy";
  if (method === "GET") {
    return new NextRequest(url, { method });
  }
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
};

describe("Buy Route", () => {
  const mockUser = { id: "u1", email: "a@b.com" };

  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthUser as jest.Mock).mockResolvedValue(mockUser);
    (checkRateLimitPersistent as jest.Mock).mockResolvedValue(true);
  });

  describe("GET", () => {
    test("returns 401 if not authenticated", async () => {
      (getAuthUser as jest.Mock).mockResolvedValue(null);
      const res = await GET(makeReq("GET"));
      expect(res.status).toBe(401);
    });

    test("returns user orders", async () => {
      (prisma.cryptoOrder.findMany as jest.Mock).mockResolvedValue([{ id: "o1" }]);
      const res = await GET(makeReq("GET"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.orders).toEqual([{ id: "o1" }]);
    });
  });

  describe("POST", () => {
    test("returns 429 when rate limited", async () => {
      (checkRateLimitPersistent as jest.Mock).mockResolvedValue(false);
      const res = await POST(makeReq("POST", { provider: "TRANSAK", fiatAmount: "100" }));
      expect(res.status).toBe(429);
    });

    test("returns 401 if not authenticated", async () => {
      (getAuthUser as jest.Mock).mockResolvedValue(null);
      const res = await POST(makeReq("POST", { provider: "TRANSAK", fiatAmount: "100" }));
      expect(res.status).toBe(401);
    });

    test("returns 400 for invalid JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 for invalid provider", async () => {
      const res = await POST(makeReq("POST", { provider: "UNKNOWN", fiatAmount: "100" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid provider");
    });

    test("returns 400 for missing fiatAmount", async () => {
      const res = await POST(makeReq("POST", { provider: "TRANSAK" }));
      expect(res.status).toBe(400);
    });

    test("returns 400 for negative fiatAmount", async () => {
      const res = await POST(makeReq("POST", { provider: "TRANSAK", fiatAmount: "-5" }));
      expect(res.status).toBe(400);
    });

    test("returns 400 for amount below provider minimum", async () => {
      const res = await POST(makeReq("POST", { provider: "TRANSAK", fiatAmount: "1" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Minimum amount");
    });

    test("returns 400 for amount above provider maximum", async () => {
      const res = await POST(makeReq("POST", { provider: "TRANSAK", fiatAmount: "999999" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Maximum amount");
    });

    test("returns 400 for unsupported crypto asset", async () => {
      const res = await POST(makeReq("POST", { provider: "TRANSAK", fiatAmount: "100", cryptoAsset: "DOGE" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Unsupported crypto asset");
    });

    test("returns 400 for unsupported fiat currency", async () => {
      const res = await POST(makeReq("POST", { provider: "TRANSAK", fiatAmount: "100", fiatCurrency: "JPY" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Unsupported fiat currency");
    });

    test("returns 400 if user has no wallet", async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await POST(makeReq("POST", { provider: "TRANSAK", fiatAmount: "100" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("No wallet found");
    });

    test("creates order and returns widget URL", async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        id: "w1",
        smartAccountAddress: "0xWALLET",
      });
      (prisma.cryptoOrder.create as jest.Mock).mockResolvedValue({
        id: "order-1",
        provider: "TRANSAK",
      });
      (prisma.cryptoOrder.update as jest.Mock).mockResolvedValue({});
      (prisma.notification.create as jest.Mock).mockResolvedValue({});

      const res = await POST(makeReq("POST", { provider: "TRANSAK", fiatAmount: "100" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.widgetUrl).toContain("transak.com");
      expect(body.order).toBeDefined();
      expect(prisma.notification.create).toHaveBeenCalled();
    });
  });
});
