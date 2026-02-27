import { GET, PATCH } from "@/app/api/admin/payment-requests/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    paymentRequest: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe("Admin Payment Requests API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
  });

  test("GET returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/payment-requests");
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(prisma.paymentRequest.findMany).not.toHaveBeenCalled();
  });

  test("GET rejects invalid status", async () => {
    const req = new Request("http://localhost:3000/api/admin/payment-requests?status=UNKNOWN");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.paymentRequest.findMany).not.toHaveBeenCalled();
  });

  test("GET falls back to default pagination", async () => {
    (prisma.paymentRequest.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.paymentRequest.count as unknown as jest.Mock).mockResolvedValue(0);
    (prisma.paymentRequest.groupBy as unknown as jest.Mock).mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/admin/payment-requests?page=abc&limit=-10");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.paymentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    );
  });

  test("GET returns 500 when query fails", async () => {
    (prisma.paymentRequest.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const req = new Request("http://localhost:3000/api/admin/payment-requests");
    const res = await GET(req);

    expect(res.status).toBe(500);
  });

  test("PATCH rejects invalid action", async () => {
    const req = new Request("http://localhost:3000/api/admin/payment-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "req-1", action: "BAD" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.paymentRequest.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/payment-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "req-1", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect(prisma.paymentRequest.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/payment-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.paymentRequest.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when request is missing", async () => {
    (prisma.paymentRequest.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/payment-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "missing", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.paymentRequest.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 409 when request is not pending", async () => {
    (prisma.paymentRequest.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "p1",
      requestId: "req-1",
      status: "PAID",
    });

    const req = new Request("http://localhost:3000/api/admin/payment-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "req-1", action: "EXPIRE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(409);
    expect(prisma.paymentRequest.update).not.toHaveBeenCalled();
  });

  test("PATCH cancels pending request and writes audit log", async () => {
    (prisma.paymentRequest.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "p1",
      requestId: "req-1",
      status: "PENDING",
    });

    (prisma.paymentRequest.update as unknown as jest.Mock).mockResolvedValue({
      id: "p1",
      requestId: "req-1",
      status: "CANCELLED",
    });

    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/payment-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "req-1", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.paymentRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: { status: "CANCELLED" },
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("PATCH returns 500 on unexpected errors", async () => {
    (prisma.paymentRequest.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "p1",
      requestId: "req-1",
      status: "PENDING",
    });
    (prisma.paymentRequest.update as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/admin/payment-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "req-1", action: "EXPIRE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(500);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
