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

  test("GET returns bookings summary counts", async () => {
    (prisma.booking.findMany as unknown as jest.Mock).mockResolvedValue([
      { id: "b1", status: "PENDING" },
      { id: "b2", status: "CONFIRMED" },
      { id: "b3", status: "COMPLETED" },
      { id: "b4", status: "CANCELLED" },
      { id: "b5", status: "PENDING" },
    ]);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toEqual({
      total: 5,
      pending: 2,
      confirmed: 1,
      completed: 1,
      cancelled: 1,
    });
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

  test("PATCH trims bookingId before lookup", async () => {
    (prisma.booking.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "b-trim",
      userId: "u1",
      chamberName: "Heart Clinic",
      date: "2026-03-01",
      timeSlot: "10:00",
    });

    (prisma.booking.update as unknown as jest.Mock).mockResolvedValue({
      id: "b-trim",
      status: "CONFIRMED",
    });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "  b-trim  ", action: "CONFIRM" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.booking.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b-trim" } })
    );
  });

  test("PATCH completes booking and sets completedAt", async () => {
    (prisma.booking.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "b2",
      userId: "u1",
      chamberName: "Heart Clinic",
      date: "2026-03-02",
      timeSlot: "11:00",
    });

    (prisma.booking.update as unknown as jest.Mock).mockResolvedValue({ id: "b2", status: "COMPLETED" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "b2", action: "COMPLETE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED", completedAt: expect.any(Date) }),
      })
    );
  });

  test("PATCH cancels booking and sets cancelledAt", async () => {
    (prisma.booking.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "b3",
      userId: "u1",
      chamberName: "Heart Clinic",
      date: "2026-03-03",
      timeSlot: "12:00",
    });

    (prisma.booking.update as unknown as jest.Mock).mockResolvedValue({ id: "b3", status: "CANCELLED" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "b3", action: "CANCEL" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED", cancelledAt: expect.any(Date) }),
      })
    );
  });

  test("PATCH marks booking as no show", async () => {
    (prisma.booking.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "b4",
      userId: "u1",
      chamberName: "Heart Clinic",
      date: "2026-03-04",
      timeSlot: "13:00",
    });

    (prisma.booking.update as unknown as jest.Mock).mockResolvedValue({ id: "b4", status: "NO_SHOW" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "b4", action: "NO_SHOW" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "NO_SHOW" }),
      })
    );
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

  test("PATCH returns 500 when notification write fails", async () => {
    (prisma.booking.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "b5",
      userId: "u1",
      chamberName: "Heart Clinic",
      date: "2026-03-05",
      timeSlot: "14:00",
    });
    (prisma.booking.update as unknown as jest.Mock).mockResolvedValue({ id: "b5", status: "CONFIRMED" });
    (prisma.notification.create as unknown as jest.Mock).mockRejectedValue(new Error("notification down"));

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "b5", action: "CONFIRM" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(500);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test("PATCH returns 500 when audit log write fails", async () => {
    (prisma.booking.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "b6",
      userId: "u1",
      chamberName: "Heart Clinic",
      date: "2026-03-06",
      timeSlot: "15:00",
    });
    (prisma.booking.update as unknown as jest.Mock).mockResolvedValue({ id: "b6", status: "CONFIRMED" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockRejectedValue(new Error("audit down"));

    const req = new Request("http://localhost:3000/api/admin/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: "b6", action: "CONFIRM" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(500);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
});
