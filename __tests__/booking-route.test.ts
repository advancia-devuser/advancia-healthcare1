import { GET, PATCH, POST } from "@/app/api/booking/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { creditWallet, debitWallet } from "@/lib/ledger";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ledger", () => ({
  debitWallet: jest.fn(),
  creditWallet: jest.fn(),
}));

describe("Booking API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  function futureDate(daysAhead = 2): string {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + daysAhead);
    return date.toISOString().slice(0, 10);
  }

  test("GET returns user bookings and chambers", async () => {
    (prisma.booking.findMany as unknown as jest.Mock).mockResolvedValue([{ id: "b1" }]);

    const req = new Request("http://localhost:3000/api/booking");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.chambers)).toBe(true);
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  test("POST rejects invalid chamber", async () => {
    const req = new Request("http://localhost:3000/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chamber: "delta", date: futureDate(), timeSlot: "09:00 AM" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid duration", async () => {
    const req = new Request("http://localhost:3000/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chamber: "alpha", date: futureDate(), timeSlot: "09:00 AM", duration: "bad" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  test("POST returns 409 when slot already booked", async () => {
    (prisma.booking.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "existing" });

    const req = new Request("http://localhost:3000/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chamber: "alpha", date: futureDate(), timeSlot: "09:00 AM" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  test("POST creates pending booking when not paying with wallet", async () => {
    (prisma.booking.findFirst as unknown as jest.Mock).mockResolvedValue(null);
    (prisma.booking.create as unknown as jest.Mock).mockResolvedValue({ id: "b1", status: "PENDING" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n1" });

    const req = new Request("http://localhost:3000/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chamber: " alpha ",
        date: futureDate(),
        timeSlot: "09:00 AM",
        duration: 2,
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(debitWallet).not.toHaveBeenCalled();
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chamber: "alpha",
          status: "PENDING",
          duration: 120,
        }),
      })
    );
  });

  test("POST creates confirmed booking when paying with wallet", async () => {
    (prisma.booking.findFirst as unknown as jest.Mock).mockResolvedValue(null);
    (debitWallet as unknown as jest.Mock).mockResolvedValue({ transactionId: "tx1" });
    (prisma.booking.create as unknown as jest.Mock).mockResolvedValue({ id: "b2", status: "CONFIRMED" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a2" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n2" });

    const req = new Request("http://localhost:3000/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chamber: "beta",
        date: futureDate(),
        timeSlot: "11:00 AM",
        payWithWallet: true,
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(debitWallet).toHaveBeenCalledTimes(1);
    expect(prisma.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CONFIRMED", txHash: "tx1" }),
      })
    );
  });

  test("PATCH rejects missing bookingId", async () => {
    const req = new Request("http://localhost:3000/api/booking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 for missing booking", async () => {
    (prisma.booking.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/booking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "missing" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  test("PATCH cancels booking and refunds paid booking", async () => {
    const cancelDate = futureDate(3);
    (prisma.booking.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "b1",
      userId: "u1",
      date: cancelDate,
      status: "CONFIRMED",
      paidWithAsset: "ETH",
      paidAmount: "1000",
    });
    (prisma.booking.update as unknown as jest.Mock).mockResolvedValue({ id: "b1", status: "CANCELLED" });
    (creditWallet as unknown as jest.Mock).mockResolvedValue({ transactionId: "tx-refund" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a3" });

    const req = new Request("http://localhost:3000/api/booking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: " b1 " }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1" }, data: { status: "CANCELLED" } })
    );
    expect(creditWallet).toHaveBeenCalledTimes(1);
  });
});
