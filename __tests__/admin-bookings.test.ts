import { GET, PATCH } from "@/app/api/admin/bookings/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    booking: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe("Admin Bookings API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
  });

  test("GET returns 403 when not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(403);
  });

  test("GET returns 500 when query fails", async () => {
    (prisma.booking.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(500);
  });

  test("PATCH rejects invalid action", async () => {
    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "b1", action: "INVALID" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.booking.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH returns 403 when not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "b1", action: "CONFIRM" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect(prisma.booking.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH rejects missing bookingId", async () => {
    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONFIRM" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.booking.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.booking.findUnique).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when booking does not exist", async () => {
    (prisma.booking.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "missing", action: "CONFIRM" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  test("PATCH confirms booking and writes notification + audit", async () => {
    (prisma.booking.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "b1",
      userId: "u1",
      chamberName: "Heart Clinic",
      date: "2026-03-01",
      timeSlot: "10:00",
    });

    (prisma.booking.update as unknown as jest.Mock).mockResolvedValue({
      id: "b1",
      status: "CONFIRMED",
    });

    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "b1", action: "CONFIRM" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b1" },
        data: expect.objectContaining({ status: "CONFIRMED" }),
      })
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("PATCH returns 500 on unexpected errors", async () => {
    (prisma.booking.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "b1",
      userId: "u1",
      chamberName: "Heart Clinic",
      date: "2026-03-01",
      timeSlot: "10:00",
    });
    (prisma.booking.update as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "b1", action: "CONFIRM" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(500);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
