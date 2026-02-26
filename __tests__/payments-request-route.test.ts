import { GET, PATCH, POST } from "@/app/api/payments/request/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    wallet: {
      findUnique: jest.fn(),
    },
    paymentRequest: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe("Payments Request API", () => {
  const approvedUser = { id: "u1", address: "0xabc", status: "APPROVED" };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET rejects invalid status filter", async () => {
    const req = new Request("http://localhost:3000/api/payments/request?status=INVALID");

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.paymentRequest.findMany).not.toHaveBeenCalled();
  });

  test("GET falls back to default pagination", async () => {
    (prisma.paymentRequest.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.paymentRequest.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/payments/request?page=abc&limit=-5");

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.paymentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    );
  });

  test("POST rejects invalid amount", async () => {
    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "1.5" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.paymentRequest.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid expiresIn", async () => {
    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 0 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.paymentRequest.create).not.toHaveBeenCalled();
  });

  test("POST creates payment request for valid payload", async () => {
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({
      userId: "u1",
      chainId: 421614,
      smartAccountAddress: "0xsmart",
    });

    (prisma.paymentRequest.create as unknown as jest.Mock).mockResolvedValue({
      id: "p1",
      requestId: "req-1",
      amount: "10",
      status: "PENDING",
    });

    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "10", asset: "ETH", note: "Coffee", expiresIn: 2 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.paymentRequest.create).toHaveBeenCalledTimes(1);
  });

  test("PATCH rejects invalid action", async () => {
    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "r1", action: "EXPIRE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.paymentRequest.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 409 when request is not pending", async () => {
    (prisma.paymentRequest.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "p1",
      status: "PAID",
    });

    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "r1", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(409);
    expect(prisma.paymentRequest.update).not.toHaveBeenCalled();
  });
});
