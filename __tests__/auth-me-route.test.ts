/**
 * Tests for GET /api/auth/me
 */
import { NextResponse } from "next/server";

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    wallet: { findUnique: jest.fn() },
  },
}));

jest.mock("@/lib/auth", () => ({
  getAuthUser: jest.fn(),
}));

import { GET } from "@/app/api/auth/me/route";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

const mockGetAuthUser = getAuthUser as jest.Mock;
const mockWalletFindUnique = prisma.wallet.findUnique as jest.Mock;

function makeRequest() {
  return new Request("http://localhost/api/auth/me", { method: "GET" });
}

beforeEach(() => jest.clearAllMocks());

describe("GET /api/auth/me", () => {
  it("returns 401 when user is not authenticated", async () => {
    mockGetAuthUser.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 200 with user and wallet", async () => {
    const fakeUser = { id: "u1", address: "0xABC", email: "a@b.com" };
    const fakeWallet = { id: "w1", userId: "u1", balance: 100 };

    mockGetAuthUser.mockResolvedValue(fakeUser);
    mockWalletFindUnique.mockResolvedValue(fakeWallet);

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.user).toEqual(fakeUser);
    expect(json.wallet).toEqual(fakeWallet);
    expect(mockWalletFindUnique).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("returns 200 with null wallet when wallet not found", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "u2" });
    mockWalletFindUnique.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.wallet).toBeNull();
  });

  it("returns 500 on unexpected error", async () => {
    mockGetAuthUser.mockRejectedValue(new Error("DB crash"));

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error).toBe("DB crash");
  });
});
