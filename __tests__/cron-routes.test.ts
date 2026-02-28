/**
 * Cron Routes — Unit Tests
 * Tests auth gating (CRON_SECRET) and basic success/error paths
 * for all cron route handlers.
 */

import { prisma } from "@/lib/db";

// Global mocks
jest.mock("@/lib/db", () => ({
  prisma: {
    billPayment: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    subscription: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    installmentPayment: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn() },
    auditLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    cardRequest: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    conversion: { findMany: jest.fn().mockResolvedValue([]) },
    wallet: { findMany: jest.fn().mockResolvedValue([]) },
    transaction: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    healthCard: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    healthReminder: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    healthTransaction: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    paymentRequest: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    withdrawal: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("@/lib/ledger", () => ({
  debitWallet: jest.fn().mockResolvedValue({ newBalance: "0", transactionId: "t1" }),
  creditWallet: jest.fn().mockResolvedValue({ newBalance: "100", transactionId: "t2" }),
}));

jest.mock("@/lib/email", () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  sendWithdrawalEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/sms", () => ({
  sendSms: jest.fn().mockResolvedValue({ success: true }),
  sendNotificationSms: jest.fn().mockResolvedValue({ success: true }),
  sendHealthReminderSms: jest.fn().mockResolvedValue({ success: true }),
}));

const CRON_SECRET_BACKUP = process.env.CRON_SECRET;

function makeRequest(method: string, secret?: string) {
  const headers: Record<string, string> = {};
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return new Request("http://localhost/api/cron/test", { method, headers });
}

describe("Cron Routes", () => {
  beforeAll(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterAll(() => {
    if (CRON_SECRET_BACKUP) {
      process.env.CRON_SECRET = CRON_SECRET_BACKUP;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("cron/bills", () => {
    let POST: any;
    beforeAll(async () => {
      ({ POST } = await import("@/app/api/cron/bills/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await POST(makeRequest("POST", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero bills and returns success", async () => {
      (prisma.billPayment.findMany as jest.Mock).mockResolvedValue([]);
      const res = await POST(makeRequest("POST", "test-cron-secret"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.total).toBe(0);
    });
  });

  describe("cron/subscriptions", () => {
    let POST: any;
    beforeAll(async () => {
      ({ POST } = await import("@/app/api/cron/subscriptions/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await POST(makeRequest("POST", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero subscriptions and returns success", async () => {
      (prisma.subscription.findMany as jest.Mock).mockResolvedValue([]);
      const res = await POST(makeRequest("POST", "test-cron-secret"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  describe("cron/installments", () => {
    let GET: any;
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/cron/installments/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await GET(makeRequest("GET", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero installments and returns success", async () => {
      (prisma.installmentPayment.findMany as jest.Mock).mockResolvedValue([]);
      const res = await GET(makeRequest("GET", "test-cron-secret"));
      expect(res.status).toBe(200);
    });
  });

  describe("cron/cards", () => {
    let GET: any;
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/cron/cards/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await GET(makeRequest("GET", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero card requests and returns success", async () => {
      (prisma.cardRequest.findMany as jest.Mock).mockResolvedValue([]);
      const res = await GET(makeRequest("GET", "test-cron-secret"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.processed).toBe(0);
    });
  });

  describe("cron/health-expiry", () => {
    let GET: any;
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/cron/health-expiry/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await GET(makeRequest("GET", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero health cards and returns success", async () => {
      (prisma.healthCard.findMany as jest.Mock).mockResolvedValue([]);
      const res = await GET(makeRequest("GET", "test-cron-secret"));
      expect(res.status).toBe(200);
    });
  });

  describe("cron/health-reminders", () => {
    let GET: any;
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/cron/health-reminders/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await GET(makeRequest("GET", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero reminders and returns success", async () => {
      (prisma.healthReminder.findMany as jest.Mock).mockResolvedValue([]);
      const res = await GET(makeRequest("GET", "test-cron-secret"));
      expect(res.status).toBe(200);
    });
  });

  describe("cron/health-transactions", () => {
    let GET: any;
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/cron/health-transactions/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await GET(makeRequest("GET", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero health transactions and returns success", async () => {
      (prisma.healthTransaction.findMany as jest.Mock).mockResolvedValue([]);
      const res = await GET(makeRequest("GET", "test-cron-secret"));
      expect(res.status).toBe(200);
    });
  });

  describe("cron/payment-requests", () => {
    let GET: any;
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/cron/payment-requests/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await GET(makeRequest("GET", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero expired requests and returns success", async () => {
      (prisma.paymentRequest.findMany as jest.Mock).mockResolvedValue([]);
      const res = await GET(makeRequest("GET", "test-cron-secret"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.expired).toBe(0);
    });
  });

  describe("cron/notifications", () => {
    let GET: any;
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/cron/notifications/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await GET(makeRequest("GET", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero audit logs and returns success", async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
      const res = await GET(makeRequest("GET", "test-cron-secret"));
      expect(res.status).toBe(200);
    });
  });

  describe("cron/withdrawals", () => {
    let GET: any;
    beforeAll(async () => {
      ({ GET } = await import("@/app/api/cron/withdrawals/route"));
    });

    test("returns 401 without valid cron secret", async () => {
      const res = await GET(makeRequest("GET", "wrong-secret"));
      expect(res.status).toBe(401);
    });

    test("processes zero withdrawals and returns success", async () => {
      (prisma.withdrawal.findMany as jest.Mock).mockResolvedValue([]);
      const res = await GET(makeRequest("GET", "test-cron-secret"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.processed).toEqual(expect.any(Number));
    });
  });
});
