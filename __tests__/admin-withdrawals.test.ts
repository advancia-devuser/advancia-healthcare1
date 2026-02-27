import { GET, PATCH } from "@/app/api/admin/withdrawals/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";
import { sendWithdrawalEmail } from "@/lib/email";
import { sendWithdrawalSms } from "@/lib/sms";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

const txMock = {
  withdrawal: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("@/lib/db", () => ({
  prisma: {
    withdrawal: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: typeof txMock) => unknown) => callback(txMock)),
  },
}));

jest.mock("@/lib/ledger", () => ({
  debitWallet: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  sendWithdrawalEmail: jest.fn(async () => ({ success: true })),
}));

jest.mock("@/lib/sms", () => ({
  sendWithdrawalSms: jest.fn(async () => ({ success: true })),
}));

describe("Admin Withdrawals API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      async (callback: (tx: typeof txMock) => unknown) => callback(txMock)
    );
  });

  test("GET returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/withdrawals");
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(prisma.withdrawal.findMany).not.toHaveBeenCalled();
  });

  test("GET returns 400 for invalid status", async () => {
    const req = new Request("http://localhost:3000/api/admin/withdrawals?status=invalid");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(prisma.withdrawal.findMany).not.toHaveBeenCalled();
  });

  test("GET falls back to default page/limit", async () => {
    (prisma.withdrawal.findMany as unknown as jest.Mock).mockResolvedValue([]);
    (prisma.withdrawal.count as unknown as jest.Mock).mockResolvedValue(0);

    const req = new Request("http://localhost:3000/api/admin/withdrawals?page=abc&limit=-7");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.withdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      })
    );
  });

  test("GET returns 500 when database query fails", async () => {
    (prisma.withdrawal.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const req = new Request("http://localhost:3000/api/admin/withdrawals");
    const res = await GET(req);

    expect(res.status).toBe(500);
  });

  test("PATCH rejects invalid action", async () => {
    const req = new Request("http://localhost:3000/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdrawalId: "w1", action: "INVALID" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("PATCH returns 403 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdrawalId: "w1", action: "APPROVE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("PATCH returns 404 when withdrawal is missing", async () => {
    (txMock.withdrawal.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdrawalId: "missing", action: "APPROVE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(txMock.withdrawal.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 409 when withdrawal is not pending", async () => {
    (txMock.withdrawal.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      userId: "u1",
      status: "APPROVED",
    });

    const req = new Request("http://localhost:3000/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdrawalId: "w1", action: "REJECT" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(409);
    expect(txMock.withdrawal.update).not.toHaveBeenCalled();
  });

  test("PATCH approves pending withdrawal and writes audit log", async () => {
    (txMock.withdrawal.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      userId: "u1",
      status: "PENDING",
      amount: "1.5",
      asset: "ETH",
      chainId: 1,
      toAddress: "0xabc",
      user: { email: "u1@test.com", phone: "+12345678901", address: "0x1" },
    });

    (debitWallet as unknown as jest.Mock).mockResolvedValue({ transactionId: "tx1" });

    (txMock.withdrawal.update as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      userId: "u1",
      amount: "1.5",
      asset: "ETH",
      user: { email: "u1@test.com", phone: "+12345678901" },
    });

    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdrawalId: "w1", action: "APPROVE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(debitWallet).toHaveBeenCalledTimes(1);
    expect(sendWithdrawalEmail).toHaveBeenCalledWith("u1@test.com", "APPROVED", "1.5", "ETH");
    expect(sendWithdrawalSms).toHaveBeenCalledWith("+12345678901", "APPROVED", "1.5", "ETH");
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("PATCH rejects pending withdrawal and writes audit log", async () => {
    (txMock.withdrawal.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "w2",
      userId: "u1",
      status: "PENDING",
      amount: "2.0",
      asset: "ETH",
      chainId: 1,
      toAddress: "0xdef",
      user: { email: "u1@test.com", phone: "+12345678901", address: "0x1" },
    });

    (txMock.withdrawal.update as unknown as jest.Mock).mockResolvedValue({
      id: "w2",
      userId: "u1",
      amount: "2.0",
      asset: "ETH",
      user: { email: "u1@test.com", phone: "+12345678901" },
    });

    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdrawalId: "w2", action: "REJECT" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(debitWallet).not.toHaveBeenCalled();
    expect(sendWithdrawalEmail).toHaveBeenCalledWith("u1@test.com", "REJECTED", "2.0", "ETH");
    expect(sendWithdrawalSms).toHaveBeenCalledWith("+12345678901", "REJECTED", "2.0", "ETH");
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("PATCH maps insufficient balance errors to 400", async () => {
    (txMock.withdrawal.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      userId: "u1",
      status: "PENDING",
      amount: "10",
      asset: "ETH",
      chainId: 1,
      toAddress: "0xabc",
      user: { email: "u1@test.com", phone: "+12345678901", address: "0x1" },
    });

    (debitWallet as unknown as jest.Mock).mockRejectedValue(new Error("Insufficient balance: have 1, need 10"));

    const req = new Request("http://localhost:3000/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdrawalId: "w1", action: "APPROVE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test("PATCH returns 500 for unexpected errors", async () => {
    (txMock.withdrawal.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      userId: "u1",
      status: "PENDING",
      amount: "10",
      asset: "ETH",
      chainId: 1,
      toAddress: "0xabc",
      user: { email: "u1@test.com", phone: "+12345678901", address: "0x1" },
    });

    (debitWallet as unknown as jest.Mock).mockRejectedValue(new Error("Unexpected ledger failure"));

    const req = new Request("http://localhost:3000/api/admin/withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ withdrawalId: "w1", action: "APPROVE" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(500);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
