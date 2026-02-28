/**
 * Tests for lib/esim-otp.ts
 * Covers sendOtp, verifyOtp, cleanupExpiredOtps.
 */

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    otpVerification: {
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/sms", () => ({
  sendSms: jest.fn(),
}));

import { sendOtp, verifyOtp, cleanupExpiredOtps } from "@/lib/esim-otp";
import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/sms";

const mockCount = prisma.otpVerification.count as jest.Mock;
const mockCreate = prisma.otpVerification.create as jest.Mock;
const mockUpdateMany = prisma.otpVerification.updateMany as jest.Mock;
const mockFindFirst = prisma.otpVerification.findFirst as jest.Mock;
const mockUpdate = prisma.otpVerification.update as jest.Mock;
const mockDeleteMany = prisma.otpVerification.deleteMany as jest.Mock;
const mockSendSms = sendSms as jest.Mock;

beforeEach(() => jest.clearAllMocks());

/* ────────── sendOtp ────────── */
describe("sendOtp", () => {
  it("rejects invalid phone (no E.164)", async () => {
    const result = await sendOtp("12345");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid phone");
  });

  it("rejects empty phone", async () => {
    const result = await sendOtp("");
    expect(result.success).toBe(false);
  });

  it("rate-limits after 3 recent OTPs", async () => {
    mockCount.mockResolvedValue(3);
    const result = await sendOtp("+1234567890");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Too many");
  });

  it("creates OTP and sends via SMS on success", async () => {
    mockCount.mockResolvedValue(0);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockResolvedValue({});
    mockSendSms.mockResolvedValue({ success: true });

    const result = await sendOtp("+1234567890", "LOGIN");
    expect(result.success).toBe(true);
    expect(result.maskedPhone).toBeDefined();
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockSendSms).toHaveBeenCalled();
  });

  it("returns success even when SMS fails (dev fallback)", async () => {
    mockCount.mockResolvedValue(0);
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockResolvedValue({});
    mockSendSms.mockResolvedValue({ success: false });

    const spy = jest.spyOn(console, "log").mockImplementation();
    const result = await sendOtp("+1234567890");
    expect(result.success).toBe(true);   // dev fallback logs to console
    spy.mockRestore();
  });
});

/* ────────── verifyOtp ────────── */
describe("verifyOtp", () => {
  it("rejects when phone or code missing", async () => {
    const r1 = await verifyOtp("", "1234");
    expect(r1.success).toBe(false);

    const r2 = await verifyOtp("+123", "");
    expect(r2.success).toBe(false);
  });

  it("returns error when no pending OTP found", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await verifyOtp("+1234567890", "1234");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No pending OTP");
  });

  it("returns error when OTP expired", async () => {
    mockFindFirst.mockResolvedValue({
      id: "otp1",
      code: "1234",
      expiresAt: new Date(Date.now() - 60000),   // 1 min ago
      attempts: 0,
    });
    const result = await verifyOtp("+1234567890", "1234");
    expect(result.success).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("returns error when max attempts reached", async () => {
    mockFindFirst.mockResolvedValue({
      id: "otp1",
      code: "1234",
      expiresAt: new Date(Date.now() + 300000),
      attempts: 5,
    });
    const result = await verifyOtp("+1234567890", "1234");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Too many failed attempts");
  });

  it("returns error on wrong code and increments attempts", async () => {
    mockFindFirst.mockResolvedValue({
      id: "otp1",
      code: "1234",
      expiresAt: new Date(Date.now() + 300000),
      attempts: 0,
    });
    mockUpdate.mockResolvedValue({});

    const result = await verifyOtp("+1234567890", "9999");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid code");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: 1 } })
    );
  });

  it("verifies correct code and marks as verified", async () => {
    mockFindFirst.mockResolvedValue({
      id: "otp1",
      code: "1234",
      expiresAt: new Date(Date.now() + 300000),
      attempts: 0,
    });
    mockUpdate.mockResolvedValue({});

    const result = await verifyOtp("+1234567890", "1234");
    expect(result.success).toBe(true);
    expect(result.phone).toBe("+1234567890");
    // First call: increment attempts; second call: mark verified
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });
});

/* ────────── cleanupExpiredOtps ────────── */
describe("cleanupExpiredOtps", () => {
  it("deletes old records and returns count", async () => {
    mockDeleteMany.mockResolvedValue({ count: 7 });
    const result = await cleanupExpiredOtps();
    expect(result).toBe(7);
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: expect.objectContaining({ lt: expect.any(Date) }) },
      })
    );
  });
});
