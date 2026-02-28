/**
 * Tests for POST /api/buy/webhook/[provider]
 * Covers Transak, MoonPay, Ramp, and unknown provider paths.
 */
import { NextRequest } from "next/server";

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    cryptoOrder: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notification: { create: jest.fn() },
  },
}));

jest.mock("@/lib/ledger", () => ({
  creditWallet: jest.fn().mockResolvedValue({ id: "c1" }),
}));

import { POST } from "@/app/api/buy/webhook/[provider]/route";
import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/ledger";

const mockOrderFind = prisma.cryptoOrder.findFirst as jest.Mock;
const mockOrderUpdate = prisma.cryptoOrder.update as jest.Mock;
const mockOrderUpdateMany = prisma.cryptoOrder.updateMany as jest.Mock;
const mockNotifCreate = prisma.notification.create as jest.Mock;

const REAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...REAL_ENV };
  // Clear webhook secrets so signature checks are skipped
  delete process.env.TRANSAK_WEBHOOK_SECRET;
  delete process.env.MOONPAY_WEBHOOK_SECRET;
  delete process.env.RAMP_WEBHOOK_SECRET;
});
afterAll(() => { process.env = REAL_ENV; });

/* Helper to build NextRequest + params */
function makeWebhookReq(
  provider: string,
  body: any,
  extraHeaders?: Record<string, string>
) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
  const req = new NextRequest(`http://localhost/api/buy/webhook/${provider}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
  const paramsPromise = Promise.resolve({ provider });
  return { req, params: paramsPromise };
}

/* Shared order fixture */
const ORDER = {
  id: "ord1",
  userId: "u1",
  provider: "TRANSAK",
  cryptoAsset: "ETH",
  fiatAmount: "50",
  fiatCurrency: "USD",
  chainId: 421614,
  walletAddress: "0xWALLET",
  status: "PENDING",
  providerOrderId: "prov-1",
};

/* ────────── Unknown provider ────────── */
describe("Unknown provider", () => {
  it("returns 400 for unsupported provider", async () => {
    const { req, params } = makeWebhookReq("unknown", {});
    const res = await POST(req, { params });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe("Unknown provider");
  });
});

/* ────────── Transak ────────── */
describe("Transak webhook", () => {
  it("processes COMPLETED event, credits wallet and notifies", async () => {
    const payload = {
      webhookData: {
        id: "prov-1",
        status: "COMPLETED",
        cryptoAmount: "0.02",
        transactionHash: "0xTXHASH",
        partnerOrderId: "ord1",
      },
    };

    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderFind.mockResolvedValue({ ...ORDER, providerOrderId: "prov-1" });
    mockOrderUpdate.mockResolvedValue({});
    mockNotifCreate.mockResolvedValue({});

    const { req, params } = makeWebhookReq("transak", payload);
    const res = await POST(req, { params });
    const json = await res.json();

    expect(json.processed).toBe(true);
    expect(json.reason).toContain("Completed");
    expect(creditWallet).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", asset: "ETH", type: "BUY" })
    );
    expect(mockNotifCreate).toHaveBeenCalled();
  });

  it("processes FAILED event", async () => {
    const payload = {
      webhookData: { id: "prov-1", status: "FAILED" },
    };
    mockOrderFind.mockResolvedValue({ ...ORDER, status: "PROCESSING" });
    mockOrderUpdate.mockResolvedValue({});
    mockNotifCreate.mockResolvedValue({});

    const { req, params } = makeWebhookReq("transak", payload);
    const res = await POST(req, { params });
    const json = await res.json();
    expect(json.processed).toBe(true);
    expect(json.reason).toContain("failed");
  });

  it("handles order not found", async () => {
    const payload = { webhookData: { id: "missing", status: "COMPLETED" } };
    mockOrderFind.mockResolvedValue(null);

    const { req, params } = makeWebhookReq("transak", payload);
    const res = await POST(req, { params });
    const json = await res.json();
    expect(json.processed).toBe(false);
    expect(json.reason).toContain("not found");
  });

  it("idempotent — already completed", async () => {
    const payload = { webhookData: { id: "prov-1", status: "COMPLETED" } };
    mockOrderFind.mockResolvedValue({ ...ORDER, status: "COMPLETED" });

    const { req, params } = makeWebhookReq("transak", payload);
    const res = await POST(req, { params });
    const json = await res.json();
    expect(json.processed).toBe(true);
    expect(json.reason).toContain("Already completed");
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("returns 401 when signature is invalid", async () => {
    process.env.TRANSAK_WEBHOOK_SECRET = "real-secret";
    const payload = { webhookData: { id: "prov-1", status: "COMPLETED" } };
    // Must be 64 hex chars (SHA-256 HMAC hex digest length) to avoid timingSafeEqual RangeError
    const fakeSig = "a".repeat(64);
    const { req, params } = makeWebhookReq("transak", payload, {
      "x-transak-signature": fakeSig,
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });
});

/* ────────── MoonPay ────────── */
describe("MoonPay webhook", () => {
  it("processes completed event", async () => {
    const payload = {
      data: {
        id: "mp-1",
        status: "completed",
        quoteCurrencyAmount: "0.01",
        cryptoTransactionId: "0xMP",
        externalTransactionId: "ord2",
      },
    };
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderFind.mockResolvedValue({
      ...ORDER,
      id: "ord2",
      provider: "MOONPAY",
      providerOrderId: "mp-1",
    });
    mockOrderUpdate.mockResolvedValue({});
    mockNotifCreate.mockResolvedValue({});

    const { req, params } = makeWebhookReq("moonpay", payload);
    const res = await POST(req, { params });
    const json = await res.json();
    expect(json.processed).toBe(true);
    expect(creditWallet).toHaveBeenCalled();
  });

  it("returns 401 with invalid moonpay signature", async () => {
    process.env.MOONPAY_WEBHOOK_SECRET = "mp-secret";
    const fakeSig = "b".repeat(64);
    const { req, params } = makeWebhookReq("moonpay", { data: { id: "x" } }, {
      "moonpay-signature-v2": fakeSig,
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });
});

/* ────────── Ramp ────────── */
describe("Ramp webhook", () => {
  it("processes RELEASED event", async () => {
    const payload = {
      type: "RELEASED",
      purchase: {
        id: "ramp-1",
        cryptoAmount: "5000000000000000000",
        finalTxHash: "0xRAMP",
      },
    };
    mockOrderFind.mockResolvedValue({
      ...ORDER,
      provider: "RAMP",
      providerOrderId: "ramp-1",
    });
    mockOrderUpdate.mockResolvedValue({});
    mockNotifCreate.mockResolvedValue({});

    const { req, params } = makeWebhookReq("ramp", payload);
    const res = await POST(req, { params });
    const json = await res.json();
    expect(json.processed).toBe(true);
  });

  it("maps EXPIRED type to FAILED status", async () => {
    const payload = { type: "EXPIRED", purchase: { id: "ramp-1" } };
    mockOrderFind.mockResolvedValue({
      ...ORDER,
      provider: "RAMP",
      providerOrderId: "ramp-1",
    });
    mockOrderUpdate.mockResolvedValue({});
    mockNotifCreate.mockResolvedValue({});

    const { req, params } = makeWebhookReq("ramp", payload);
    const res = await POST(req, { params });
    const json = await res.json();
    expect(json.reason).toContain("failed");
  });

  it("returns 401 with invalid ramp signature", async () => {
    process.env.RAMP_WEBHOOK_SECRET = "ramp-secret";
    // Ramp uses base64-encoded HMAC — provide same-length base64 string
    const fakeSig = Buffer.from("c".repeat(32)).toString("base64");
    const { req, params } = makeWebhookReq("ramp", { type: "RELEASED", purchase: {} }, {
      "x-body-signature": fakeSig,
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });
});
