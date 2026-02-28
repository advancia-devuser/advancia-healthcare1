import { GET, PATCH } from "@/app/api/admin/cards/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

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

  test("GET returns 500 when query fails", async () => {
    (prisma.cardRequest.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const req = new Request("http://localhost:3000/api/admin/cards");
    const res = await GET(req);

    expect(res.status).toBe(500);
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

  test("PATCH returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "c1", action: "APPROVE", last4: "1234" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect(prisma.cardRequest.update).not.toHaveBeenCalled();
  });

  test("PATCH rejects missing cardId", async () => {
    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE", last4: "1234" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    expect(prisma.cardRequest.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
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

  test("PATCH trims cardId before update", async () => {
    (prisma.cardRequest.update as unknown as jest.Mock).mockResolvedValue({
      id: "card-trim",
      userId: "user-1",
      status: "REJECTED",
      last4: null,
    });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "  card-trim  ", action: "REJECT" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.cardRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "card-trim" } })
    );
  });

  test("PATCH approves card without last4 and stores null", async () => {
    (prisma.cardRequest.update as unknown as jest.Mock).mockResolvedValue({
      id: "card-2",
      userId: "user-2",
      status: "APPROVED",
      last4: null,
    });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "card-2", action: "APPROVE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.cardRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED", last4: null }),
      })
    );
  });

  test("PATCH rejects card and writes audit log", async () => {
    (prisma.cardRequest.update as unknown as jest.Mock).mockResolvedValue({
      id: "card-3",
      userId: "user-3",
      status: "REJECTED",
      last4: "9999",
    });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "card-3", action: "REJECT" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.cardRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED" }),
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CARD_REJECT" }),
      })
    );
  });

  test("PATCH returns 404 when card request does not exist", async () => {
    const notFoundError = new Prisma.PrismaClientKnownRequestError(
      "Record to update not found.",
      {
        code: "P2025",
        clientVersion: "test",
      }
    );

    (prisma.cardRequest.update as unknown as jest.Mock).mockRejectedValue(notFoundError);

    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "missing-card", action: "REJECT" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Card request not found");
  });

  test("PATCH returns 500 for unexpected errors", async () => {
    (prisma.cardRequest.update as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/admin/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: "card-1", action: "REJECT" }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(500);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
