import { GET } from "@/app/api/admin/stats/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: jest.fn(),
    },
    transaction: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    withdrawal: {
      count: jest.fn(),
    },
    cardRequest: {
      count: jest.fn(),
    },
    paymentRequest: {
      count: jest.fn(),
    },
  },
}));

describe("Admin Stats API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
  });

  test("GET returns 403 when not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const res = await GET();

    expect(res.status).toBe(403);
  });

  test("GET returns aggregated stats", async () => {
    (prisma.user.count as unknown as jest.Mock)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(90)
      .mockResolvedValueOnce(2);

    (prisma.transaction.count as unknown as jest.Mock).mockResolvedValue(450);
    (prisma.withdrawal.count as unknown as jest.Mock).mockResolvedValue(3);
    (prisma.cardRequest.count as unknown as jest.Mock).mockResolvedValue(12);
    (prisma.transaction.findMany as unknown as jest.Mock).mockResolvedValue([{ id: "t1" }]);

    (prisma.paymentRequest.count as unknown as jest.Mock)
      .mockResolvedValueOnce(22)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(17);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalUsers).toBe(100);
    expect(body.pendingApproval).toBe(5);
    expect(body.approvedUsers).toBe(90);
    expect(body.suspendedUsers).toBe(2);
    expect(body.totalTransactions).toBe(450);
    expect(body.pendingWithdrawals).toBe(3);
    expect(body.totalCardRequests).toBe(12);
    expect(body.recentTransactions).toEqual([{ id: "t1" }]);
    expect(body.paymentRequests).toEqual({ total: 22, pending: 4, paid: 17 });
  });

  test("GET returns 500 on query failure", async () => {
    (prisma.user.count as unknown as jest.Mock).mockRejectedValue(new Error("db error"));

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch stats");
  });
});
