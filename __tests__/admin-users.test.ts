import { GET, PATCH } from "@/app/api/admin/users/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendAccountStatusEmail } from "@/lib/email";
import { sendAccountStatusSms } from "@/lib/sms";
import { Prisma } from "@prisma/client";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
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

jest.mock("@/lib/email", () => ({
  sendAccountStatusEmail: jest.fn(async () => ({ success: true })),
}));

jest.mock("@/lib/sms", () => ({
  sendAccountStatusSms: jest.fn(async () => ({ success: true })),
}));

describe("Admin Users API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
  });

  test("GET returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/users");
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test("GET rejects invalid status", async () => {
    const req = new Request("http://localhost:3000/api/admin/users?status=INVALID");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test("GET falls back to default pagination when page/limit invalid", async () => {
    (prisma.user.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.user.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/admin/users?page=abc&limit=-8");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    );
  });

  test("GET normalizes status/search and caps limit at 100", async () => {
    (prisma.user.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.user.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/admin/users?status= approved &search= alice &page=2&limit=1000");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "APPROVED",
          OR: [
            { address: { contains: "alice" } },
            { email: { contains: "alice" } },
          ],
        }),
        skip: 100,
        take: 100,
      })
    );
  });

  test("GET returns 500 when query fails", async () => {
    (prisma.user.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const req = new Request("http://localhost:3000/api/admin/users");
    const res = await GET(req);

    expect(res.status).toBe(500);
  });

  test("PATCH rejects invalid action", async () => {
    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", action: "INVALID" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", action: "APPROVE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("PATCH rejects missing userId", async () => {
    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when user is missing", async () => {
    const notFoundError = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "test",
    });

    (prisma.user.update as unknown as jest.Mock).mockRejectedValue(notFoundError);

    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "missing", action: "APPROVE" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  test("PATCH updates status and creates notifications/audit", async () => {
    (prisma.user.update as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "u1@test.com",
      phone: "+12345678901",
      status: "APPROVED",
    });

    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", action: "UNSUSPEND" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { status: "APPROVED" },
      })
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(sendAccountStatusEmail).toHaveBeenCalledWith("u1@test.com", "RESTORED");
    expect(sendAccountStatusSms).toHaveBeenCalledWith("+12345678901", "RESTORED");
  });

  test("PATCH trims userId before update", async () => {
    (prisma.user.update as unknown as jest.Mock).mockResolvedValue({
      id: "u-trim",
      email: null,
      phone: null,
      status: "APPROVED",
    });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "  u-trim  ", action: "APPROVE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u-trim" } })
    );
  });

  test("PATCH maps REJECT action to rejected status notifications", async () => {
    (prisma.user.update as unknown as jest.Mock).mockResolvedValue({
      id: "u2",
      email: "u2@test.com",
      phone: "+12345678901",
      status: "REJECTED",
    });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u2", action: "REJECT" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REJECTED" } })
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Account Rejected",
        }),
      })
    );
    expect(sendAccountStatusEmail).toHaveBeenCalledWith("u2@test.com", "REJECTED");
    expect(sendAccountStatusSms).toHaveBeenCalledWith("+12345678901", "REJECTED");
  });

  test("PATCH skips email and sms when user has no contact fields", async () => {
    (prisma.user.update as unknown as jest.Mock).mockResolvedValue({
      id: "u3",
      email: null,
      phone: null,
      status: "SUSPENDED",
    });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u3", action: "SUSPEND" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(sendAccountStatusEmail).not.toHaveBeenCalled();
    expect(sendAccountStatusSms).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("PATCH returns 500 for unexpected errors", async () => {
    (prisma.user.update as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", action: "SUSPEND" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(500);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
