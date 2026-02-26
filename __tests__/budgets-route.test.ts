import { DELETE, GET, PATCH, POST } from "@/app/api/budgets/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    budget: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe("Budgets API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET returns budgets with summary", async () => {
    (prisma.budget.findMany as unknown as jest.Mock).mockResolvedValue([
      {
        id: "b1",
        userId: "u1",
        name: "Groceries",
        category: "food",
        limitAmount: "100",
        spentAmount: "30",
        asset: "ETH",
        periodStart: new Date(),
        periodEnd: new Date(),
        createdAt: new Date(),
      },
    ]);

    const req = new Request("http://localhost:3000/api/budgets");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalBudgets).toBe(1);
    expect(body.summary.totalLimit).toBe("100");
  });

  test("POST rejects invalid limit amount", async () => {
    const req = new Request("http://localhost:3000/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Food", category: "food", limitAmount: "10.5" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.budget.create).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.budget.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid period order", async () => {
    const req = new Request("http://localhost:3000/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Food",
        category: "food",
        limitAmount: "100",
        periodStart: "2026-02-10T00:00:00.000Z",
        periodEnd: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.budget.create).not.toHaveBeenCalled();
  });

  test("POST creates budget with normalized values", async () => {
    (prisma.budget.create as unknown as jest.Mock).mockResolvedValue({ id: "b1", name: "Food" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });

    const req = new Request("http://localhost:3000/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  Food  ",
        category: "  groceries ",
        limitAmount: 1000,
        asset: " usdc ",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(prisma.budget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Food",
          category: "groceries",
          limitAmount: "1000",
          asset: "usdc",
        }),
      })
    );
  });

  test("PATCH requires at least one updatable field", async () => {
    (prisma.budget.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "b1", userId: "u1" });

    const req = new Request("http://localhost:3000/api/budgets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetId: "b1" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/budgets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.budget.findFirst).not.toHaveBeenCalled();
  });

  test("PATCH rejects invalid spentAmount", async () => {
    (prisma.budget.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "b1", userId: "u1" });

    const req = new Request("http://localhost:3000/api/budgets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetId: "b1", spentAmount: "12.75" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when budget is missing", async () => {
    (prisma.budget.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/budgets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetId: "missing", limitAmount: "200" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(prisma.budget.update).not.toHaveBeenCalled();
  });

  test("PATCH updates budget with normalized fields", async () => {
    (prisma.budget.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "b1", userId: "u1" });
    (prisma.budget.update as unknown as jest.Mock).mockResolvedValue({ id: "b1", name: "Travel" });

    const req = new Request("http://localhost:3000/api/budgets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetId: "b1",
        name: "  Travel  ",
        category: "  trips ",
        limitAmount: 2000,
        spentAmount: "500",
      }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "b1" },
        data: expect.objectContaining({
          name: "Travel",
          category: "trips",
          limitAmount: "2000",
          spentAmount: "500",
        }),
      })
    );
  });

  test("DELETE rejects missing budgetId", async () => {
    const req = new Request("http://localhost:3000/api/budgets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.budget.deleteMany).not.toHaveBeenCalled();
  });

  test("DELETE returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/budgets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.budget.deleteMany).not.toHaveBeenCalled();
  });

  test("DELETE removes only user-owned budget", async () => {
    (prisma.budget.deleteMany as unknown as jest.Mock).mockResolvedValue({ count: 1 });

    const req = new Request("http://localhost:3000/api/budgets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetId: "b1" }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(prisma.budget.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1", userId: "u1" } })
    );
  });
});
