import { GET, POST } from "@/app/api/transfers/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { transferInternal } from "@/lib/ledger";
import { verifyUserPin } from "@/lib/pin-verify";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    wallet: {
      findUnique: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    notification: {
      createMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ledger", () => ({
  transferInternal: jest.fn(),
}));

jest.mock("@/lib/pin-verify", () => ({
  verifyUserPin: jest.fn(async () => null),
}));

describe("Transfers API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
    pin: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET falls back to default pagination", async () => {
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({ userId: "u1" });
    (prisma.transaction.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.transaction.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/transfers?page=abc&limit=-5");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    );
  });

  test("POST rejects invalid amount format", async () => {
    const req = new Request("http://localhost:3000/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientAddress: "0xdef456", amount: "1.5" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(transferInternal).not.toHaveBeenCalled();
  });

  test("POST rejects invalid chainId", async () => {
    const req = new Request("http://localhost:3000/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientAddress: "0xdef456", amount: "10", chainId: "abc" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(transferInternal).not.toHaveBeenCalled();
  });

  test("POST returns 404 when recipient is missing", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientAddress: "0xdef456", amount: "10" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(transferInternal).not.toHaveBeenCalled();
  });

  test("POST enforces PIN when user has one", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({ ...approvedUser, pin: "salt:hash" });
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({ id: "u2", address: "0xdef456" });
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({ userId: "u2" });
    (verifyUserPin as unknown as jest.Mock).mockResolvedValueOnce(
      Response.json({ error: "Incorrect PIN" }, { status: 401 })
    );

    const req = new Request("http://localhost:3000/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientAddress: "0xdef456", amount: "10", pin: "1234" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(transferInternal).not.toHaveBeenCalled();
  });

  test("POST performs transfer and creates notifications", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({ id: "u2", address: "0xdef456" });
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({ userId: "u2" });
    (transferInternal as unknown as jest.Mock).mockResolvedValue({
      debit: { transactionId: "tx1", newBalance: "90" },
      credit: { transactionId: "tx2", newBalance: "10" },
    });
    (prisma.notification.createMany as unknown as jest.Mock).mockResolvedValue({ count: 2 });

    const req = new Request("http://localhost:3000/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientAddress: "0xdef456", amount: "10", asset: "ETH" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(transferInternal).toHaveBeenCalledTimes(1);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  test("POST maps insufficient balance errors to 400", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({ id: "u2", address: "0xdef456" });
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({ userId: "u2" });
    (transferInternal as unknown as jest.Mock).mockRejectedValue(new Error("Insufficient balance: have 1, need 10"));

    const req = new Request("http://localhost:3000/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientAddress: "0xdef456", amount: "10" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});
