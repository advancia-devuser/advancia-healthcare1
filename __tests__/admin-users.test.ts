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
});
