import { DELETE, GET, PATCH, POST } from "@/app/api/health/reminders/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    healthReminder: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

describe("Health Reminders API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET rejects invalid status filter", async () => {
    const req = new Request("http://localhost:3000/api/health/reminders?status=invalid");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.findMany).not.toHaveBeenCalled();
  });

  test("GET filters by valid status and type", async () => {
    (prisma.healthReminder.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.healthReminder.groupBy as unknown as jest.Mock).mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/health/reminders?status=pending&type=Medication");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.healthReminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", status: "PENDING", type: "Medication" } })
    );
  });

  test("GET rejects invalid type filter", async () => {
    const req = new Request("http://localhost:3000/api/health/reminders?type=UnknownType");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.findMany).not.toHaveBeenCalled();
  });

  test("GET passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const req = new Request("http://localhost:3000/api/health/reminders");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(prisma.healthReminder.findMany).not.toHaveBeenCalled();
  });

  test("GET returns 500 on unexpected errors", async () => {
    (prisma.healthReminder.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const req = new Request("http://localhost:3000/api/health/reminders");
    const res = await GET(req);

    expect(res.status).toBe(500);
  });

  test("POST rejects past remindAt", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Medication", message: "Take pills", remindAt: past }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.create).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.create).not.toHaveBeenCalled();
  });

  test("POST creates reminder and notification", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    (prisma.healthReminder.create as unknown as jest.Mock).mockResolvedValue({ id: "r1" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n1" });

    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Medication", message: "  Take pills  ", remindAt: future }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.healthReminder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          type: "Medication",
          message: "Take pills",
        }),
      })
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  test("PATCH rejects empty update payload", async () => {
    (prisma.healthReminder.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "r1", userId: "u1" });

    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderId: "r1" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.update).not.toHaveBeenCalled();
  });

  test("PATCH rejects missing reminderId", async () => {
    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH rejects invalid status value", async () => {
    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderId: "r1", status: "INVALID" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH rejects invalid remindAt value", async () => {
    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderId: "r1", remindAt: "not-a-date" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when reminder is missing", async () => {
    (prisma.healthReminder.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderId: "missing", status: "COMPLETED" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.healthReminder.update).not.toHaveBeenCalled();
  });

  test("PATCH updates status/message/remindAt", async () => {
    const future = new Date(Date.now() + 7_200_000).toISOString();
    (prisma.healthReminder.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "r1", userId: "u1" });
    (prisma.healthReminder.update as unknown as jest.Mock).mockResolvedValue({ id: "r1", status: "COMPLETED" });

    const req = new Request("http://localhost:3000/api/health/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderId: " r1 ", status: "completed", message: "  done  ", remindAt: future }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.healthReminder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "r1" },
        data: expect.objectContaining({ status: "COMPLETED", message: "done", remindAt: expect.any(Date) }),
      })
    );
  });

  test("DELETE rejects missing reminderId", async () => {
    const req = new Request("http://localhost:3000/api/health/reminders");
    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.healthReminder.findFirst).not.toHaveBeenCalled();
  });

  test("DELETE returns 404 when reminder is missing", async () => {
    (prisma.healthReminder.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/health/reminders?reminderId=missing");
    const res = await DELETE(req);

    expect(res.status).toBe(404);
    expect(prisma.healthReminder.delete).not.toHaveBeenCalled();
  });

  test("DELETE removes owned reminder", async () => {
    (prisma.healthReminder.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "r1", userId: "u1" });
    (prisma.healthReminder.delete as unknown as jest.Mock).mockResolvedValue({ id: "r1" });

    const req = new Request("http://localhost:3000/api/health/reminders?reminderId=r1");
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(prisma.healthReminder.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });

  test("DELETE passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Rate limited" }, { status: 429 })
    );

    const req = new Request("http://localhost:3000/api/health/reminders?reminderId=r1");
    const res = await DELETE(req);

    expect(res.status).toBe(429);
    expect(prisma.healthReminder.findFirst).not.toHaveBeenCalled();
  });

  test("DELETE returns 500 on unexpected errors", async () => {
    (prisma.healthReminder.findFirst as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/health/reminders?reminderId=r1");
    const res = await DELETE(req);

    expect(res.status).toBe(500);
  });
});
