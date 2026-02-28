/**
 * Tests for POST /api/auth/register
 */
import { NextResponse } from "next/server";

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { update: jest.fn() },
  },
}));

jest.mock("@/lib/auth", () => ({
  resolveUser: jest.fn(),
}));

import { POST } from "@/app/api/auth/register/route";
import { prisma } from "@/lib/db";
import { resolveUser } from "@/lib/auth";

const mockResolveUser = resolveUser as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;

function makeReq(body: any) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => jest.clearAllMocks());

describe("POST /api/auth/register", () => {
  it("returns 400 for invalid (non-JSON) body", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "text/plain" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request body");
  });

  it("returns 400 when address is missing", async () => {
    const res = await POST(makeReq({ email: "a@b.com" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("address is required");
  });

  it("returns 400 when address is empty string", async () => {
    const res = await POST(makeReq({ address: "  " }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with user from resolveUser", async () => {
    const fakeUser = { id: "u1", address: "0xABC", email: null };
    mockResolveUser.mockResolvedValue(fakeUser);

    const res = await POST(makeReq({ address: "0xABC" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.id).toBe("u1");
    expect(mockResolveUser).toHaveBeenCalledWith("0xABC");
  });

  it("attaches email when user has no existing email", async () => {
    const fakeUser = { id: "u1", address: "0xABC", email: null };
    mockResolveUser.mockResolvedValue(fakeUser);
    mockUserUpdate.mockResolvedValue({});

    const res = await POST(makeReq({ address: "0xABC", email: "new@e.com" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { email: "new@e.com" },
    });
    expect(json.user.email).toBe("new@e.com");
  });

  it("does NOT overwrite existing email", async () => {
    const fakeUser = { id: "u1", address: "0xABC", email: "old@e.com" };
    mockResolveUser.mockResolvedValue(fakeUser);

    const res = await POST(makeReq({ address: "0xABC", email: "new@e.com" }));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("trims the address before resolving", async () => {
    mockResolveUser.mockResolvedValue({ id: "u2", address: "0xDEF", email: null });
    await POST(makeReq({ address: "  0xDEF  " }));
    expect(mockResolveUser).toHaveBeenCalledWith("0xDEF");
  });

  it("returns 500 on unexpected error", async () => {
    mockResolveUser.mockRejectedValue(new Error("DB error"));
    const res = await POST(makeReq({ address: "0xABC" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("DB error");
  });
});
