import { GET, POST } from "@/app/api/payments/qr/route";
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
    paymentRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
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

describe("Payments QR API", () => {
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

  test("GET rejects invalid amount format", async () => {
    const req = new Request("http://localhost:3000/api/payments/qr?amount=1.5&asset=ETH");

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
  });

  test("POST rejects non-boolean confirm", async () => {
    const req = new Request("http://localhost:3000/api/payments/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qrData: JSON.stringify({ type: "smartwallet-pay", recipient: "0xdef", amount: "10" }),
        confirm: "yes",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  test("POST rejects invalid qrData payload", async () => {
    const req = new Request("http://localhost:3000/api/payments/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrData: "{bad json}" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  test("POST parse mode returns parsed details", async () => {
    (prisma.paymentRequest.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/payments/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qrData: JSON.stringify({
          type: "smartwallet-pay",
          recipient: "0xdef",
          amount: "100",
          asset: "ETH",
          chainId: 1,
          requestId: "req-1",
        }),
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parsed).toBe(true);
    expect(body.amount).toBe("100");
    expect(body.asset).toBe("ETH");
    expect(body.requestId).toBe("req-1");
  });

  test("POST confirm mode returns 404 when recipient is missing", async () => {
    (prisma.paymentRequest.findUnique as unknown as jest.Mock).mockResolvedValue(null);
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/payments/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qrData: JSON.stringify({ type: "smartwallet-pay", recipient: "0xdef", amount: "10" }),
        confirm: true,
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(404);
    expect(transferInternal).not.toHaveBeenCalled();
  });

  test("POST confirm mode enforces PIN when user has one", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({ ...approvedUser, pin: "salt:hash" });
    (prisma.paymentRequest.findUnique as unknown as jest.Mock).mockResolvedValue(null);
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({ id: "u2", address: "0xdef456" });
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({ userId: "u2" });
    (verifyUserPin as unknown as jest.Mock).mockResolvedValueOnce(
      Response.json({ error: "Incorrect PIN" }, { status: 401 })
    );

    const req = new Request("http://localhost:3000/api/payments/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qrData: JSON.stringify({ type: "smartwallet-pay", recipient: "0xdef456", amount: "10" }),
        confirm: true,
        pin: "1234",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(transferInternal).not.toHaveBeenCalled();
  });

  test("POST confirm mode pays request and creates notifications", async () => {
    (prisma.paymentRequest.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "p1",
      status: "PENDING",
      expiresAt: null,
    });

    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "u2",
      address: "0xdef456",
    });

    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({
      userId: "u2",
      smartAccountAddress: "0xsmart",
    });

    (transferInternal as unknown as jest.Mock).mockResolvedValue({
      debit: { transactionId: "tx1", newBalance: "90" },
      credit: { transactionId: "tx2", newBalance: "10" },
    });

    (prisma.paymentRequest.update as unknown as jest.Mock).mockResolvedValue({});
    (prisma.notification.createMany as unknown as jest.Mock).mockResolvedValue({ count: 2 });

    const req = new Request("http://localhost:3000/api/payments/qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qrData: JSON.stringify({
          type: "smartwallet-pay",
          recipient: "0xdef456",
          amount: "10",
          asset: "ETH",
          requestId: "req-1",
        }),
        confirm: true,
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(transferInternal).toHaveBeenCalledTimes(1);
    expect(prisma.paymentRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ status: "PAID" }),
      })
    );
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });
});
