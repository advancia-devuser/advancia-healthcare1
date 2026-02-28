import { GET } from "@/app/api/payments/history/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe("Payments History Route", () => {
  const mockUser = { id: "u1", status: "APPROVED" };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as jest.Mock).mockResolvedValue(mockUser);
  });

  test("returns 401 if not authenticated", async () => {
    (requireApprovedUser as jest.Mock).mockRejectedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const req = new Request("http://localhost/api/payments/history");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("returns paginated transactions", async () => {
    const txs = [{ id: "t1", type: "SEND", amount: "100" }];
    (prisma.transaction.findMany as jest.Mock).mockResolvedValue(txs);
    (prisma.transaction.count as jest.Mock).mockResolvedValue(1);

    const req = new Request("http://localhost/api/payments/history?page=1&limit=20");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.transactions).toEqual(txs);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pages).toBe(1);
  });

  test("respects type=SEND filter", async () => {
    (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost/api/payments/history?type=SEND");
    await GET(req);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: "SEND",
        }),
      })
    );
  });

  test("respects type=RECEIVE filter", async () => {
    (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost/api/payments/history?type=RECEIVE");
    await GET(req);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: "RECEIVE",
        }),
      })
    );
  });

  test("defaults to all types when type=all", async () => {
    (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost/api/payments/history?type=all");
    await GET(req);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: expect.arrayContaining(["SEND", "RECEIVE"]) },
        }),
      })
    );
  });

  test("clamps page and limit to valid ranges", async () => {
    (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost/api/payments/history?page=0&limit=999");
    await GET(req);

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,       // page clamped to 1 → skip = 0
        take: 100,     // limit clamped to 100
      })
    );
  });

  test("returns 500 on server error", async () => {
    (requireApprovedUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.transaction.findMany as jest.Mock).mockRejectedValue(new Error("db error"));

    const req = new Request("http://localhost/api/payments/history");
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});
