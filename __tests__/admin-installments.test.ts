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

  test("GET returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/installments");
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(prisma.installment.findMany).not.toHaveBeenCalled();
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

  test("GET caps limit at 100", async () => {
    (prisma.installment.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.installment.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/admin/installments?page=2&limit=999");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.installment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100,
        take: 100,
      })
    );
  });

  test("GET returns 500 when query fails", async () => {
    (prisma.installment.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const req = new Request("http://localhost:3000/api/admin/installments");
    const res = await GET(req);

    expect(res.status).toBe(500);
  });

  test("POST returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "100",
        interestRate: "10",
        installmentCount: 3,
        frequency: "MONTHLY",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST rejects missing userId", async () => {
    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalAmount: "100",
        interestRate: "10",
        installmentCount: 3,
        frequency: "MONTHLY",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST rejects non-positive totalAmount", async () => {
    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "0",
        interestRate: "10",
        installmentCount: 3,
        frequency: "MONTHLY",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST rejects invalid decimal values", async () => {
    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "bad-decimal",
        interestRate: "10",
        installmentCount: 3,
        frequency: "MONTHLY",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST rejects negative interestRate", async () => {
    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "100",
        interestRate: "-1",
        installmentCount: 3,
        frequency: "MONTHLY",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST returns 500 for unexpected errors", async () => {
    (prisma.$transaction as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "100",
        interestRate: "10",
        installmentCount: 2,
        frequency: "MONTHLY",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
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

  test("POST rejects invalid installmentCount", async () => {
    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "100",
        interestRate: "10",
        installmentCount: "not-a-number",
        frequency: "MONTHLY",
        startDate: "2026-02-01T00:00:00.000Z",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
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

  test("POST requires startDate string", async () => {
    const req = new Request("http://localhost:3000/api/admin/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        totalAmount: "100",
        interestRate: "10",
        installmentCount: 3,
        frequency: "MONTHLY",
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
