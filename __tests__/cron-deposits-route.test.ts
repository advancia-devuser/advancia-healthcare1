/**
 * Tests for GET /api/cron/deposits
 */

/* ── Set env BEFORE module loads so module-level consts capture it ── */
process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = "test-alchemy-key";
process.env.CRON_SECRET = "cron-tok";

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    wallet: { findMany: jest.fn() },
    transaction: { findFirst: jest.fn() },
  },
}));

jest.mock("@/lib/ledger", () => ({
  creditWallet: jest.fn().mockResolvedValue({ id: "c1" }),
}));

// Mock global fetch for Alchemy RPC
const originalFetch = global.fetch;
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

import { GET } from "@/app/api/cron/deposits/route";
import { prisma } from "@/lib/db";
import { creditWallet } from "@/lib/ledger";

const mockWalletFindMany = prisma.wallet.findMany as jest.Mock;
const mockTxFindFirst = prisma.transaction.findFirst as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});
afterAll(() => { global.fetch = originalFetch; });

function makeReq(auth?: string) {
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new Request("http://localhost/api/cron/deposits", { method: "GET", headers });
}

describe("GET /api/cron/deposits", () => {
  it("returns 401 when CRON_SECRET is set but auth header is wrong", async () => {
    const res = await GET(makeReq("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with processed=0 when there are no wallets", async () => {
    mockWalletFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.processed).toBe(0);
    expect(json.totalCredited).toBe(0);
  });

  it("credits new deposits from Alchemy", async () => {
    const wallet = {
      id: "w1",
      userId: "u1",
      smartAccountAddress: "0xABCD",
      chainId: 421614,
      user: { id: "u1" },
    };
    mockWalletFindMany.mockResolvedValue([wallet]);

    // Alchemy returns one transfer
    mockFetch.mockResolvedValue({
      json: async () => ({
        result: {
          transfers: [
            {
              hash: "0xTX1",
              from: "0xSender",
              to: "0xABCD",
              value: 0.5,
              asset: "ETH",
              rawContract: { value: "0x6F05B59D3B20000", address: null, decimal: "18" },
              category: "external",
            },
          ],
        },
      }),
    });

    // Not yet recorded
    mockTxFindFirst.mockResolvedValue(null);

    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.processed).toBe(1);
    expect(json.totalCredited).toBe(1);
    expect(creditWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        asset: "ETH",
        txHash: "0xTX1",
      })
    );
  });

  it("skips already-recorded deposits", async () => {
    const wallet = {
      id: "w1",
      userId: "u1",
      smartAccountAddress: "0xABCD",
      chainId: 421614,
      user: { id: "u1" },
    };
    mockWalletFindMany.mockResolvedValue([wallet]);

    mockFetch.mockResolvedValue({
      json: async () => ({
        result: {
          transfers: [
            {
              hash: "0xTX1",
              from: "0xSender",
              to: "0xABCD",
              value: 1,
              asset: "ETH",
              rawContract: { value: "0xDE0B6B3A7640000", address: null, decimal: "18" },
              category: "external",
            },
          ],
        },
      }),
    });

    // Already in DB
    mockTxFindFirst.mockResolvedValue({ id: "t1" });

    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(json.totalCredited).toBe(0);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("handles RPC fetch errors gracefully", async () => {
    const wallet = {
      id: "w1",
      userId: "u1",
      smartAccountAddress: "0xABCD",
      chainId: 421614,
      user: { id: "u1" },
    };
    mockWalletFindMany.mockResolvedValue([wallet]);
    mockFetch.mockRejectedValue(new Error("Timeout"));

    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.results[0].errors).toContain("RPC error: Timeout");
  });

  it("handles unsupported chainId", async () => {
    const wallet = {
      id: "w1",
      userId: "u1",
      smartAccountAddress: "0xABCD",
      chainId: 99999,
      user: { id: "u1" },
    };
    mockWalletFindMany.mockResolvedValue([wallet]);

    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.results[0].errors[0]).toContain("Unsupported chainId");
  });

  it("handles transfers with no value gracefully", async () => {
    const wallet = {
      id: "w1",
      userId: "u1",
      smartAccountAddress: "0xABCD",
      chainId: 421614,
      user: { id: "u1" },
    };
    mockWalletFindMany.mockResolvedValue([wallet]);

    mockFetch.mockResolvedValue({
      json: async () => ({
        result: {
          transfers: [
            {
              hash: "0xNOVAL",
              from: "0xSender",
              to: "0xABCD",
              value: null,
              asset: "ETH",
              rawContract: { value: null, address: null, decimal: "18" },
              category: "external",
            },
          ],
        },
      }),
    });
    mockTxFindFirst.mockResolvedValue(null);

    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(json.results[0].errors[0]).toContain("No value for tx");
    expect(creditWallet).not.toHaveBeenCalled();
  });

  it("returns 500 on top-level DB error", async () => {
    mockWalletFindMany.mockRejectedValue(new Error("DB down"));
    const res = await GET(makeReq("Bearer cron-tok"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("DB down");
  });
});
