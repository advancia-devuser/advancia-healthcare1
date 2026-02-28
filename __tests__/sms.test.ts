/**
 * Unit Tests for lib/sms — SMS Service
 * Tests the core sendSms function and template helpers.
 * Since all providers require external API keys, we test the dev-console
 * fallback path and phone validation.
 */

import {
  sendSms,
  sendAccountStatusSms,
  sendWithdrawalSms,
  sendSecurityAlertSms,
  sendHealthReminderSms,
  sendNotificationSms,
} from "@/lib/sms";

describe("SMS Service Unit Tests", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("sendSms", () => {
    test("rejects invalid phone number", async () => {
      const result = await sendSms({ to: "invalid", body: "Test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid phone number");
    });

    test("rejects empty phone number", async () => {
      const result = await sendSms({ to: "", body: "Test" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid phone number");
    });

    test("rejects phone without + prefix", async () => {
      const result = await sendSms({ to: "1234567890", body: "Test" });
      expect(result.success).toBe(false);
    });

    test("succeeds in dev mode with valid E.164 phone", async () => {
      // Without any provider API keys, it falls through to dev-console fallback
      const result = await sendSms({ to: "+12345678901", body: "Hello from tests" });
      expect(result.success).toBe(true);
      expect(result.provider).toBeDefined();
    });
  });

  describe("sendAccountStatusSms", () => {
    test("sends APPROVED message", async () => {
      const result = await sendAccountStatusSms("+12345678901", "APPROVED");
      expect(result.success).toBe(true);
    });

    test("sends REJECTED message", async () => {
      const result = await sendAccountStatusSms("+12345678901", "REJECTED");
      expect(result.success).toBe(true);
    });

    test("sends SUSPENDED message", async () => {
      const result = await sendAccountStatusSms("+12345678901", "SUSPENDED");
      expect(result.success).toBe(true);
    });

    test("sends RESTORED message", async () => {
      const result = await sendAccountStatusSms("+12345678901", "RESTORED");
      expect(result.success).toBe(true);
    });
  });

  describe("sendWithdrawalSms", () => {
    test("sends APPROVED withdrawal message", async () => {
      const result = await sendWithdrawalSms("+12345678901", "APPROVED", "500", "USDC");
      expect(result.success).toBe(true);
    });

    test("sends REJECTED withdrawal message", async () => {
      const result = await sendWithdrawalSms("+12345678901", "REJECTED", "200", "ETH");
      expect(result.success).toBe(true);
    });
  });

  describe("sendSecurityAlertSms", () => {
    test("sends a security alert", async () => {
      const result = await sendSecurityAlertSms("+12345678901", "New login detected");
      expect(result.success).toBe(true);
    });
  });

  describe("sendHealthReminderSms", () => {
    test("sends a health reminder", async () => {
      const result = await sendHealthReminderSms("+12345678901", "Appointment", "Doctor visit at 10am");
      expect(result.success).toBe(true);
    });
  });

  describe("sendNotificationSms", () => {
    test("sends generic notification with detail", async () => {
      const result = await sendNotificationSms("+12345678901", "PAYMENT_RECEIVED", "50 USDC from 0x123");
      expect(result.success).toBe(true);
    });

    test("sends generic notification without detail", async () => {
      const result = await sendNotificationSms("+12345678901", "CARD_ACTIVATED");
      expect(result.success).toBe(true);
    });
  });
});
