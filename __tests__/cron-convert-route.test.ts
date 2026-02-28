/**
 * Tests for GET / POST  /api/cron/convert
 */

/* ── mocks ── */
jest.mock("@/lib/db", () => ({
  prisma: {
    conversion: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}));

jest.mock("@/lib/ledger", () => ({
  debitWallet: jest.fn().mockResolvedValue({ id: "deb1" }),
  creditWallet: jest.fn().mockResolvedValue({ id: "cre1" }),
}));

jest.mock("@/lib/auth", () => ({
  getAuthUser: jest.fn(),
}));

import { GET, POST } from "@/app/api/cron/convert/route";
import { prisma } from "@/lib/db";
import { debitWallet, creditWallet } from "@/lib/ledger";
import { getAuthUser } from "@/lib/auth";

const mockConvCreate = prisma.conversion.create as jest.Mock;
const mockConvFind = prisma.conversion.findUnique as jest.Mock;
const mockConvUpdate = prisma.conversion.update as jest.Mock;
const mockAudit = prisma.auditLog.create as jest.Mock;
const mockGetAuth = getAuthUser as jest.Mock;

const REAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...REAL_ENV,
    CRON_SECRET: "cron-tok",
    AGGREGATOR_API_KEY: "",   // force mock rates
    AGGREGATOR_API_URL: "",
  };
});
afterAll(() => { process.env = REAL_ENV; });

/* ────────── GET: Quote ────────── */
describe("GET /api/cron/convert (quote)", () => {
  function makeGet(params: Record<string, string>) {
    const sp = new URLSearchParams(params).toString();
    return new Request(`http://localhost/api/cron/convert?${sp}`, { method: "GET" });
  }

  it("returns 400 when required params are missing", async () => {
    const res = await GET(makeGet({}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("required");
  });

  it("returns quote with mock rates", async () => {
    const res = await GET(
      makeGet({ fromAsset: "ETH", toAsset: "USDC", fromAmount: "1" })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.quote).toBeDefined();
    expect(json.quote.fromAsset).toBe("ETH");
    expect(json.quote.toAsset).toBe("USDC");
    expect(json.quote.source).toBe("mock");
    expect(parseFloat(json.quote.toAmount)).toBeGreaterThan(0);
  });

  it("returns 400 for unsupported pair", async () => {
    const res = await GET(
      makeGet({ fromAsset: "SHIB", toAsset: "USDC", fromAmount: "1" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("No rate");
  });
});

/* ────────── POST: Execute conversion ────────── */
describe("POST /api/cron/convert", () => {
  function makePost(body: any, authHeader?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader) headers["authorization"] = authHeader;
    return new Request("http://localhost/api/cron/convert", {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    });
  }

  it("returns 401 when not cron, not conversionId, and user unauthenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await POST(
      makePost({ fromAsset: "ETH", toAsset: "USDC", fromAmount: "1", chainId: 421614 })
    );
    expect(res.status).toBe(401);
  });

  it("executes direct swap for cron caller", async () => {
    mockConvCreate.mockResolvedValue({ id: "conv1" });
    mockAudit.mockResolvedValue({});

    const res = await POST(
      makePost(
        { userId: "u1", fromAsset: "ETH", toAsset: "USDC", fromAmount: "1", chainId: 421614 },
        "Bearer cron-tok"
      )
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.conversion).toBeDefined();
    expect(json.quote.fromAsset).toBe("ETH");
    expect(debitWallet).toHaveBeenCalled();
    expect(creditWallet).toHaveBeenCalled();
    expect(mockConvCreate).toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalled();
  });

  it("executes direct swap for authenticated user", async () => {
    mockGetAuth.mockResolvedValue({ id: "u2" });
    mockConvCreate.mockResolvedValue({ id: "conv2" });
    mockAudit.mockResolvedValue({});

    const res = await POST(
      makePost({ fromAsset: "ETH", toAsset: "USDC", fromAmount: "1", chainId: 421614 })
    );
    expect(res.status).toBe(200);
    // userId should be overridden to the auth user
    const debitCall = (debitWallet as jest.Mock).mock.calls[0][0];
    expect(debitCall.userId).toBe("u2");
  });

  it("returns 400 when required fields are missing (cron)", async () => {
    const res = await POST(
      makePost({ fromAsset: "ETH" }, "Bearer cron-tok")
    );
    expect(res.status).toBe(400);
  });

  it("processes a pending conversion by ID", async () => {
    const pendingConv = {
      id: "conv9",
      userId: "u1",
      fromAsset: "ETH",
      toAsset: "USDC",
      fromAmount: "2",
      toAmount: null,
      chainId: 421614,
      user: { wallet: { id: "w1" } },
    };
    mockConvFind.mockResolvedValue(pendingConv);
    mockConvUpdate.mockResolvedValue({ ...pendingConv, toAmount: "4985" });

    const res = await POST(
      makePost({ conversionId: "conv9" }, "Bearer cron-tok")
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.conversion.toAmount).toBeTruthy();
    expect(debitWallet).toHaveBeenCalled();
    expect(creditWallet).toHaveBeenCalled();
  });

  it("returns 404 when conversionId not found", async () => {
    mockConvFind.mockResolvedValue(null);
    const res = await POST(
      makePost({ conversionId: "missing" }, "Bearer cron-tok")
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when conversion already processed", async () => {
    mockConvFind.mockResolvedValue({
      id: "conv9",
      toAmount: "1000",
      fromAsset: "ETH",
      toAsset: "USDC",
      fromAmount: "1",
      chainId: 421614,
    });
    const res = await POST(
      makePost({ conversionId: "conv9" }, "Bearer cron-tok")
    );
    expect(res.status).toBe(400);
  });

  it("returns 500 on unexpected error", async () => {
    (debitWallet as jest.Mock).mockRejectedValueOnce(new Error("Insufficient funds"));
    mockGetAuth.mockResolvedValue({ id: "u3" });

    const res = await POST(
      makePost({ fromAsset: "ETH", toAsset: "USDC", fromAmount: "99999", chainId: 421614 })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Insufficient funds");
  });
});
