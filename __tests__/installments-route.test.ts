import { GET, POST } from "@/app/api/installments/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    installment: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

describe("Installments API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);

    (prisma.installment.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.installment.count as unknown as jest.Mock).mockResolvedValue(0);
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });
    (prisma.installment.findUnique as unknown as jest.Mock).mockResolvedValue({ id: "i1", payments: [] });

    (prisma.$transaction as unknown as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        installment: {
          create: jest.fn().mockResolvedValue({ id: "i1" }),
        },
        installmentPayment: {
          create: jest.fn().mockResolvedValue({ id: "ip1" }),
        },
      };
      return callback(tx);
    });
  });

  test("GET falls back to safe pagination defaults", async () => {
    const req = new Request("http://localhost:3000/api/installments?page=abc&limit=-5");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.installment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST returns 400 for invalid frequency", async () => {
    const req = new Request("http://localhost:3000/api/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalAmount: "1000",
        interestRate: "10",
        installmentCount: "5",
        frequency: "YEARLY",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST returns 400 for invalid numeric fields", async () => {
    const req = new Request("http://localhost:3000/api/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalAmount: "0",
        interestRate: "-1",
        installmentCount: "0",
        frequency: "MONTHLY",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST creates installment plan successfully", async () => {
    const req = new Request("http://localhost:3000/api/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalAmount: "1000",
        interestRate: "10",
        installmentCount: "5",
        frequency: " monthly ",
        walletId: "  wallet-1  ",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.installment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i1" } })
    );
  });
});
