/**
 * Tests for GET / POST  /api/webhooks/alchemy
 */

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    wallet: { findFirst: jest.fn() },
    transaction: { findFirst: jest.fn() },
    notification: { create: jest.fn() },
  },
}));

jest.mock("@/lib/ledger", () => ({
  creditWallet: jest.fn().mockResolvedValue({
    walletBalanceId: "wb1",
    previousBalance: "0",
    newBalance: "1000000000000000000",
    transactionId: "tx1",
  }),
}));

import { GET, POST } from "@/app/api/webhooks/alchemy/route";
import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/ledger";

const mockWalletFindFirst = prisma.wallet.findFirst as jest.Mock;
const mockTxFindFirst = prisma.transaction.findFirst as jest.Mock;
const mockNotifCreate = prisma.notification.create as jest.Mock;

const REAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...REAL_ENV, ALCHEMY_WEBHOOK_SECRET: "test-secret" };
  mockWalletFindFirst.mockResolvedValue(null);
  mockTxFindFirst.mockResolvedValue(null);
  mockNotifCreate.mockResolvedValue({ id: "n1" });
});

afterAll(() => {
  process.env = REAL_ENV;
});

/* ────────── GET: Health ────────── */
describe("GET /api/webhooks/alchemy", () => {
  it("returns 200 with active message", async () => {
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.message).toContain("active");
  });
});

/* ────────── POST: Webhook ────────── */
describe("POST /api/webhooks/alchemy", () => {
  function makeReq(body: any, token?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["x-alchemy-token"] = token;
    return new Request("http://localhost/api/webhooks/alchemy", {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    });
  }

  it("returns 500 when ALCHEMY_WEBHOOK_SECRET is not set", async () => {
    delete process.env.ALCHEMY_WEBHOOK_SECRET;
    const res = await POST(makeReq({ event: {} }, "any"));
    expect(res.status).toBe(500);
  });

  it("returns 401 when x-alchemy-token is missing", async () => {
    const res = await POST(makeReq({ event: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when x-alchemy-token is wrong", async () => {
    const res = await POST(makeReq({ event: {} }, "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid token and empty activity", async () => {
    const res = await POST(makeReq({ event: { network: "ARB_SEPOLIA", activity: [] } }, "test-secret"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.processed).toBe(0);
  });

  it("credits wallet and creates notification for incoming deposit", async () => {
    const walletMock = { userId: "u1", smartAccountAddress: "0xRecipient", user: { id: "u1" } };
    // First call: recipient lookup, second call: sender lookup (null)
    mockWalletFindFirst
      .mockResolvedValueOnce(walletMock)  // recipient found
      .mockResolvedValueOnce(null);       // sender not our user
    mockTxFindFirst.mockResolvedValue(null); // not a duplicate

    const body = {
      event: {
        network: "ARB_SEPOLIA",
        activity: [
          {
            fromAddress: "0xExternal",
            toAddress: "0xRecipient",
            value: 1.5,
            asset: "ETH",
            hash: "0xabc123",
            category: "external",
          },
        ],
      },
    };

    const res = await POST(makeReq(body, "test-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.processed).toBe(1);
    expect(creditWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        asset: "ETH",
        type: "RECEIVE",
        status: "CONFIRMED",
        txHash: "0xabc123",
      })
    );
    expect(mockNotifCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          title: "Deposit Received",
          channel: "IN_APP",
        }),
      })
    );
  });

  it("skips already-recorded transactions", async () => {
    mockTxFindFirst.mockResolvedValue({ id: "existing-tx" });

    const body = {
      event: {
        network: "ARB_SEPOLIA",
        activity: [
          {
            fromAddress: "0xExternal",
            toAddress: "0xRecipient",
            value: 1.0,
            asset: "ETH",
            hash: "0xexisting",
            category: "external",
          },
        ],
      },
    };

    const res = await POST(makeReq(body, "test-secret"));
    const json = await res.json();

    expect(json.skipped).toBe(1);
    expect(json.processed).toBe(0);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("notifies sender when sender is our user", async () => {
    const senderWallet = { userId: "u2", smartAccountAddress: "0xSender", user: { id: "u2" } };
    mockWalletFindFirst
      .mockResolvedValueOnce(null)         // recipient not found
      .mockResolvedValueOnce(senderWallet); // sender is our user
    mockTxFindFirst.mockResolvedValue(null);

    const body = {
      event: {
        network: "ARB_SEPOLIA",
        activity: [
          {
            fromAddress: "0xSender",
            toAddress: "0xExternalRecipient",
            value: 0.5,
            asset: "ETH",
            hash: "0xsend123",
            category: "external",
          },
        ],
      },
    };

    const res = await POST(makeReq(body, "test-secret"));
    const json = await res.json();

    expect(json.success).toBe(true);
    // Should NOT credit (recipient not our user)
    expect(creditWallet).not.toHaveBeenCalled();
    // Should create Transfer Sent notification for sender
    expect(mockNotifCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u2",
          title: "Transfer Sent",
        }),
      })
    );
  });

  it("returns 500 when body parsing fails", async () => {
    const req = new Request("http://localhost/api/webhooks/alchemy", {
      method: "POST",
      body: "not-json",
      headers: {
        "Content-Type": "text/plain",
        "x-alchemy-token": "test-secret",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
