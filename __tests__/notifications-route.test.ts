import { DELETE, GET, PATCH } from "@/app/api/notifications/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

describe("Notifications API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET falls back to safe default pagination", async () => {
    (prisma.notification.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count as unknown as jest.Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const req = new Request("http://localhost:3000/api/notifications?page=abc&limit=-5");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    );
  });

  test("GET applies unread filter", async () => {
    (prisma.notification.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count as unknown as jest.Mock).mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    const req = new Request("http://localhost:3000/api/notifications?unread=true");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", isRead: false } })
    );
  });

  test("GET passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Denied" }, { status: 403 })
    );

    const req = new Request("http://localhost:3000/api/notifications");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Denied");
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  test("PATCH marks all notifications read", async () => {
    (prisma.notification.updateMany as unknown as jest.Mock).mockResolvedValue({ count: 3 });

    const req = new Request("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", isRead: false } })
    );
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  test("PATCH marks specific notification ids read", async () => {
    (prisma.notification.updateMany as unknown as jest.Mock).mockResolvedValue({ count: 2 });

    const req = new Request("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: ["n1", " n2 ", ""] }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["n1", "n2"] }, userId: "u1" }),
      })
    );
  });

  test("PATCH rejects missing markAllRead and ids", async () => {
    const req = new Request("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  test("PATCH rejects notificationIds with no valid string ids", async () => {
    const req = new Request("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: [123, null, "   "] }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  test("DELETE rejects missing notificationId", async () => {
    const req = new Request("http://localhost:3000/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });

  test("DELETE returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });

  test("DELETE removes notification for user", async () => {
    (prisma.notification.deleteMany as unknown as jest.Mock).mockResolvedValue({ count: 1 });

    const req = new Request("http://localhost:3000/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: " n1 " }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1", userId: "u1" } })
    );
  });

  test("DELETE passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Too many requests" }, { status: 429 })
    );

    const req = new Request("http://localhost:3000/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: "n1" }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });
});
