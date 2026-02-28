/**
 * Tests for POST / PATCH / DELETE  /api/auth/otp
 */
import { NextRequest, NextResponse } from "next/server";

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/esim-otp", () => ({
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  cleanupExpiredOtps: jest.fn(),
}));

import { POST, PATCH, DELETE } from "@/app/api/auth/otp/route";
import { prisma } from "@/lib/db";
import { sendOtp, verifyOtp, cleanupExpiredOtps } from "@/lib/esim-otp";

const mockSendOtp = sendOtp as jest.Mock;
const mockVerifyOtp = verifyOtp as jest.Mock;
const mockCleanup = cleanupExpiredOtps as jest.Mock;
const mockUserFindFirst = prisma.user.findFirst as jest.Mock;

function makeReq(body: any) {
  return new NextRequest("http://localhost/api/auth/otp", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => jest.clearAllMocks());

/* ────────── POST: Send OTP ────────── */
describe("POST /api/auth/otp", () => {
  it("returns 400 when phone is missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Phone number is required");
  });

  it("returns 429 when sendOtp fails", async () => {
    mockSendOtp.mockResolvedValue({ success: false, error: "Rate limited" });
    const res = await POST(makeReq({ phone: "+1234567890" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("Rate limited");
  });

  it("returns 200 on success with masked phone", async () => {
    mockSendOtp.mockResolvedValue({
      success: true,
      maskedPhone: "***890",
      expiresAt: new Date("2025-01-01T00:00:00Z"),
    });
    const res = await POST(makeReq({ phone: "+1234567890" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.maskedPhone).toBe("***890");
    expect(json.expiresAt).toBe("2025-01-01T00:00:00.000Z");
  });

  it("returns 500 on unexpected error", async () => {
    mockSendOtp.mockRejectedValue(new Error("boom"));
    const res = await POST(makeReq({ phone: "+1234567890" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to send OTP");
  });
});

/* ────────── PATCH: Verify OTP ────────── */
describe("PATCH /api/auth/otp", () => {
  function makePatch(body: any) {
    return new NextRequest("http://localhost/api/auth/otp", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns 400 when phone or code missing", async () => {
    const res = await PATCH(makePatch({ phone: "+123" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when verifyOtp fails", async () => {
    mockVerifyOtp.mockResolvedValue({ success: false, error: "Invalid code" });
    const res = await PATCH(makePatch({ phone: "+123", code: "9999" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid code");
  });

  it("returns 200 with user for LOGIN purpose when user exists", async () => {
    mockVerifyOtp.mockResolvedValue({ success: true, phone: "+123" });
    mockUserFindFirst.mockResolvedValue({ id: "u1", address: "0xA", phone: "+123" });

    const res = await PATCH(makePatch({ phone: "+123", code: "1234", purpose: "LOGIN" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verified).toBe(true);
    expect(json.user).toBeTruthy();
    expect(json.user.id).toBe("u1");
  });

  it("returns 200 with null user for LOGIN purpose when user absent", async () => {
    mockVerifyOtp.mockResolvedValue({ success: true, phone: "+123" });
    mockUserFindFirst.mockResolvedValue(null);

    const res = await PATCH(makePatch({ phone: "+123", code: "1234", purpose: "LOGIN" }));
    const json = await res.json();
    expect(json.verified).toBe(true);
    expect(json.user).toBeNull();
    expect(json.message).toContain("No account linked");
  });

  it("returns 200 for non-LOGIN purpose without user lookup", async () => {
    mockVerifyOtp.mockResolvedValue({ success: true, phone: "+123" });

    const res = await PATCH(makePatch({ phone: "+123", code: "1234", purpose: "VERIFY" }));
    const json = await res.json();
    expect(json.verified).toBe(true);
    expect(json.user).toBeUndefined();
    expect(mockUserFindFirst).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    mockVerifyOtp.mockRejectedValue(new Error("boom"));
    const res = await PATCH(makePatch({ phone: "+123", code: "1234" }));
    expect(res.status).toBe(500);
  });
});

/* ────────── DELETE: Cleanup ────────── */
describe("DELETE /api/auth/otp", () => {
  it("returns 200 with deleted count", async () => {
    mockCleanup.mockResolvedValue(5);
    const res = await DELETE();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deleted).toBe(5);
    expect(json.message).toContain("5");
  });

  it("returns 500 on error", async () => {
    mockCleanup.mockRejectedValue(new Error("fail"));
    const res = await DELETE();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to cleanup OTPs");
  });
});
