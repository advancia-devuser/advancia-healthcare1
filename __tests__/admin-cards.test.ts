import { GET, PATCH } from "@/app/api/admin/cards/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    cardRequest: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe("Admin Cards API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
  });

  test("GET returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/cards");
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  test("GET rejects invalid status query", async () => {
    const req = new Request("http://localhost:3000/api/admin/cards?status=INVALID");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.cardRequest.findMany).not.toHaveBeenCalled();
  });

  test("GET filters by valid status", async () => {
    (prisma.cardRequest.findMany as unknown as jest.Mock).mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/admin/cards?status=pending");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.cardRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PENDING" },
      })
    );
  });

  test("PATCH rejects invalid action", async () => {
    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c1", action: "INVALID" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    expect(prisma.cardRequest.update).not.toHaveBeenCalled();
  });

  test("PATCH rejects invalid last4", async () => {
    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c1", action: "APPROVE", last4: "12AB" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    expect(prisma.cardRequest.update).not.toHaveBeenCalled();
  });

  test("PATCH approves card and writes audit log", async () => {
    (prisma.cardRequest.update as unknown as jest.Mock).mockResolvedValue({
      id: "card-1",
      userId: "user-1",
      status: "APPROVED",
      last4: "1234",
    });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "card-1", action: "APPROVE", last4: "1234" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);

    expect(prisma.cardRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "card-1" },
        data: expect.objectContaining({
          status: "APPROVED",
          last4: "1234",
        }),
      })
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          actor: "ADMIN",
          action: "CARD_APPROVE",
        }),
      })
    );
  });
});
