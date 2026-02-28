/**
 * Tests for GET /api/cron/reconcile
 */

/* Set env before module loads */
process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = "";   // skip on-chain checks
process.env.CRON_SECRET = "cron-tok";

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    wallet: { findMany: jest.fn() },
    transaction: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

import { GET } from "@/app/api/cron/reconcile/route";
import { prisma } from "@/lib/db";

const mockWalletFind = prisma.wallet.findMany as jest.Mock;
const mockTxFind = prisma.transaction.findMany as jest.Mock;
const mockAudit = prisma.auditLog.create as jest.Mock;

beforeEach(() => jest.clearAllMocks());

function makeReq(auth?: string) {
  const headers: Record<string, string> = {};
  if (auth) headers["authorization"] = auth;
  return new Request("http://localhost/api/cron/reconcile", { method: "GET", headers });
}

describe("GET /api/cron/reconcile", () => {
  it("returns 401 without valid cron secret", async () => {
    const res = await GET(makeReq("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with 0 wallets", async () => {
    mockWalletFind.mockResolvedValue([]);
    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.total).toBe(0);
    expect(json.mismatches).toBe(0);
  });

  it("reports no mismatch when balances match", async () => {
    const wallet = {
      id: "w1",
      userId: "u1",
      balance: "1000",
      smartAccountAddress: "0xABC",
      chainId: 421614,
      user: { id: "u1" },
    };
    mockWalletFind.mockResolvedValue([wallet]);

    // Credits: 1500
    mockTxFind.mockImplementation(({ where }: any) => {
      if (where.type === "RECEIVE") {
        return Promise.resolve([{ amount: "1500" }]);
      }
      // Debits: 500
      return Promise.resolve([{ amount: "500" }]);
    });

    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(json.mismatches).toBe(0);
    expect(json.results[0].ledgerMatch).toBe(true);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("flags mismatch when ledger balance differs from computed", async () => {
    const wallet = {
      id: "w1",
      userId: "u1",
      balance: "999",                    // wrong — should be 1000
      smartAccountAddress: "0xABC",
      chainId: 421614,
      user: { id: "u1" },
    };
    mockWalletFind.mockResolvedValue([wallet]);

    mockTxFind.mockImplementation(({ where }: any) => {
      if (where.type === "RECEIVE") return Promise.resolve([{ amount: "1500" }]);
      return Promise.resolve([{ amount: "500" }]);
    });
    mockAudit.mockResolvedValue({});

    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(json.mismatches).toBe(1);
    expect(json.results[0].ledgerMatch).toBe(false);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "RECONCILE_MISMATCH" }),
      })
    );
  });

  it("handles wallets with no transactions", async () => {
    const wallet = {
      id: "w1",
      userId: "u1",
      balance: "0",
      smartAccountAddress: "0xABC",
      chainId: 421614,
      user: { id: "u1" },
    };
    mockWalletFind.mockResolvedValue([wallet]);
    mockTxFind.mockResolvedValue([]);

    const res = await GET(makeReq("Bearer cron-tok"));
    const json = await res.json();
    expect(json.mismatches).toBe(0);
    expect(json.results[0].computedBalance).toBe("0");
  });

  it("returns 500 on top-level error", async () => {
    mockWalletFind.mockRejectedValue(new Error("DB down"));
    const res = await GET(makeReq("Bearer cron-tok"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("DB down");
  });
});
