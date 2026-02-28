
import { 
  resolveUser, 
  getAuthUser, 
  requireApprovedUser, 
  getClientIP,
  registerAdminFailure,
  getAdminLockRemainingMs,
  clearAdminFailureState,
  storeAuthNonce,
  consumeAuthNonce
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

describe("Auth Library Extended", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("resolveUser", () => {
    test("returns existing user", async () => {
      const mockUser = { id: "u1", address: "0xabc" };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await resolveUser("0xABC");
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { address: "0xabc" } });
      expect(result).toEqual(mockUser);
    });

    test("creates new user if not found", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const mockUser = { id: "u2", address: "0xdef" };
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await resolveUser("0xDEF");
      expect(prisma.user.create).toHaveBeenCalledWith({ data: { address: "0xdef" } });
      expect(result).toEqual(mockUser);
    });
  });

  describe("getAuthUser", () => {
    test("returns null if no auth provided", async () => {
      const req = new Request("http://localhost");
      (cookies as jest.Mock).mockReturnValue({ get: () => null });
      const user = await getAuthUser(req);
      expect(user).toBeNull();
    });

    test("resolves user from Authorization header", async () => {
      // We need a valid token to verify. Since we aren't mocking jwtVerify in lib/auth (it's internal),
      // we'll just test the flow by assuming the verification fails or succeed if we had a real token.
      // Actually, lib/auth uses USER_JWT_SECRET which defaults to a dev secret.
      const { signUserToken } = require("@/lib/auth");
      const token = await signUserToken("u123", "0xabc");
      
      const req = new Request("http://localhost", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      const mockUser = { id: "u123", address: "0xabc" };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const user = await getAuthUser(req);
      expect(user).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u123" } });
    });

    test("resolves user from cookie", async () => {
      const { signUserToken } = require("@/lib/auth");
      const token = await signUserToken("u456", "0xdef");
      
      const req = new Request("http://localhost");
      (cookies as jest.Mock).mockReturnValue({
        get: (name: string) => name === "user_session" ? { value: token } : null
      });
      
      const mockUser = { id: "u456", address: "0xdef" };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const user = await getAuthUser(req);
      expect(user).toEqual(mockUser);
    });
  });

  describe("requireApprovedUser", () => {
    test("throws 401 if not authenticated", async () => {
      const req = new Request("http://localhost");
      (cookies as jest.Mock).mockReturnValue({ get: () => null });
      
      try {
        await requireApprovedUser(req);
        fail("Should have thrown");
      } catch (e: any) {
        expect(e).toBeInstanceOf(Response);
        expect(e.status).toBe(401);
      }
    });

    test("throws 403 if user is PENDING", async () => {
      const { signUserToken } = require("@/lib/auth");
      const token = await signUserToken("u1", "0x1");
      const req = new Request("http://localhost", { headers: { "Authorization": `Bearer ${token}` } });
      
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "u1", status: "PENDING" });

      try {
        await requireApprovedUser(req);
      } catch (e: any) {
        expect(e.status).toBe(403);
        const body = await e.json();
        expect(body.error).toBe("Account not approved");
      }
    });

    test("returns user if APPROVED", async () => {
      const { signUserToken } = require("@/lib/auth");
      const token = await signUserToken("u1", "0x1");
      const req = new Request("http://localhost", { headers: { "Authorization": `Bearer ${token}` } });
      
      const mockUser = { id: "u1", status: "APPROVED" };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await requireApprovedUser(req);
      expect(result).toEqual(mockUser);
    });
  });

  describe("getClientIP", () => {
    test("extracts from x-forwarded-for", () => {
      const req = new Request("http://l", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
      expect(getClientIP(req)).toBe("1.2.3.4");
    });

    test("extracts from x-real-ip", () => {
      const req = new Request("http://l", { headers: { "x-real-ip": "9.9.9.9" } });
      expect(getClientIP(req)).toBe("9.9.9.9");
    });

    test("returns unknown if no headers", () => {
      const req = new Request("http://l");
      expect(getClientIP(req)).toBe("unknown");
    });
  });

  describe("Admin Failure and Lock (Memory Mode)", () => {
    const ip = "127.0.0.1";

    test("registers failures and locks after threshold", async () => {
      // Threshold is 5.
      for (let i = 0; i < 4; i++) {
        const res = await registerAdminFailure(ip);
        expect(res.lockMs).toBe(0);
      }
      
      const res = await registerAdminFailure(ip);
      expect(res.count).toBe(5);
      expect(res.lockMs).toBeGreaterThan(0);

      const remaining = await getAdminLockRemainingMs(ip);
      expect(remaining).toBeGreaterThan(0);
    });

    test("clears failure state", async () => {
      await registerAdminFailure(ip);
      await clearAdminFailureState(ip);
      const remaining = await getAdminLockRemainingMs(ip);
      expect(remaining).toBe(0);
    });
  });

  describe("Auth Nonce (Memory Mode)", () => {
    test("stores and consumes nonce", async () => {
      const addr = "0xNonce";
      const nonce = "123456";
      
      await storeAuthNonce(addr, nonce);
      const consumed = await consumeAuthNonce(addr);
      expect(consumed).toBe(nonce);
      
      const consumedAgain = await consumeAuthNonce(addr);
      expect(consumedAgain).toBeNull();
    });

    test("normalized address internally", async () => {
      await storeAuthNonce("0xABC", "val");
      expect(await consumeAuthNonce("0xabc")).toBe("val");
    });
  });
});
