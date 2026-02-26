import { GET, POST } from "@/app/api/admin/installments/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

const txMock = {
  installment: {
    create: jest.fn(),
  },
  installmentPayment: {
    create: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  prisma: {
    installment: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: typeof txMock) => unknown) => callback(txMock)),
  },
}));

describe("Admin Installments API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      async (callback: (tx: typeof txMock) => unknown) => callback(txMock)
    );
  });

  test("GET falls back to defaults for invalid pagination", async () => {
    (prisma.installment.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.installment.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/admin/installments?page=abc&limit=-5");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.installment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    );
  });

  test("POST rejects invalid frequency", async () => {
    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "100",
        interestRate: "10",
        installmentCount: 3,
        frequency: "YEARLY",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST rejects invalid startDate", async () => {
    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "100",
        interestRate: "10",
        installmentCount: 3,
        frequency: "MONTHLY",
        startDate: "not-a-date",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST accepts zero interest and creates payments", async () => {
    (txMock.installment.create as unknown as jest.Mock).mockResolvedValue({
      id: "inst-1",
      userId: "u1",
      installmentCount: 2,
      frequency: "MONTHLY",
    });

    (txMock.installmentPayment.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "100",
        interestRate: "0",
        installmentCount: 2,
        frequency: "MONTHLY",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(txMock.installment.create).toHaveBeenCalledTimes(1);
    expect(txMock.installmentPayment.create).toHaveBeenCalledTimes(2);
  });
});
