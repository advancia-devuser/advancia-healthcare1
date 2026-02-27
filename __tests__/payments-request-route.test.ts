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

  test("GET normalizes status and caps limit at 100", async () => {
    (prisma.paymentRequest.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.paymentRequest.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/payments/request?status= pending &page=2&limit=999");

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.paymentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", status: "PENDING" },
        skip: 100,
        take: 100,
      })
    );
  });

  test("GET passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const req = new Request("http://localhost:3000/api/payments/request");

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(prisma.paymentRequest.findMany).not.toHaveBeenCalled();
  });

  test("GET returns 500 on unexpected errors", async () => {
    (prisma.paymentRequest.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const req = new Request("http://localhost:3000/api/payments/request");

    const res = await GET(req);

    expect(res.status).toBe(500);
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

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
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

  test("POST rejects invalid note", async () => {
    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "   " }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.paymentRequest.create).not.toHaveBeenCalled();
  });

  test("POST returns 404 when wallet is missing", async () => {
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "10" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(404);
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

  test("POST passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Rate limited" }, { status: 429 })
    );

    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "10" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
  });

  test("POST returns 500 on unexpected errors", async () => {
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({
      userId: "u1",
      chainId: 421614,
      smartAccountAddress: "0xsmart",
    });
    (prisma.paymentRequest.create as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "10" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
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

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
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

  test("PATCH returns 404 when request is missing", async () => {
    (prisma.paymentRequest.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "missing", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.paymentRequest.update).not.toHaveBeenCalled();
  });

  test("PATCH cancels pending request", async () => {
    (prisma.paymentRequest.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "p1",
      status: "PENDING",
      requestId: "r1",
    });
    (prisma.paymentRequest.update as unknown as jest.Mock).mockResolvedValue({
      id: "p1",
      status: "CANCELLED",
    });

    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "r1", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.paymentRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: { status: "CANCELLED" },
      })
    );
  });

  test("PATCH passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Forbidden" }, { status: 403 })
    );

    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "r1", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect(prisma.paymentRequest.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 500 on unexpected errors", async () => {
    (prisma.paymentRequest.findFirst as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/payments/request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "r1", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(500);
  });
});
