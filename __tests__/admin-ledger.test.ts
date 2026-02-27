import { PATCH, POST } from "@/app/api/admin/ledger/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { creditWallet, debitWallet } from "@/lib/ledger";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ledger", () => ({
  creditWallet: jest.fn(),
  debitWallet: jest.fn(),
}));

describe("Admin Ledger API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
  });

  test("POST rejects invalid amount", async () => {
    const req = new Request("http://localhost:3000/api/admin/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", amount: "1.5" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  test("POST rejects invalid type", async () => {
    const req = new Request("http://localhost:3000/api/admin/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", amount: "10", type: "INVALID" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(creditWallet).not.toHaveBeenCalled();
  });

  test("POST returns 404 when user is missing", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", amount: "10" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  test("POST credits approved user and writes audit log", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      status: "APPROVED",
      address: "0xabc",
    });

    (creditWallet as unknown as jest.Mock).mockResolvedValue({
      transactionId: "t1",
      previousBalance: "0",
      newBalance: "10",
    });

    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", amount: "10", type: "RECEIVE" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(creditWallet).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("PATCH maps insufficient balance error to 400", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      status: "APPROVED",
      address: "0xabc",
    });

    (debitWallet as unknown as jest.Mock).mockRejectedValue(new Error("Insufficient balance: have 1, need 10"));

    const req = new Request("http://localhost:3000/api/admin/ledger", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", amount: "10", type: "SEND" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/ledger", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(debitWallet).not.toHaveBeenCalled();
  });

  test("PATCH maps duplicate txHash to 409", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      status: "APPROVED",
      address: "0xabc",
    });

    (debitWallet as unknown as jest.Mock).mockRejectedValue(new Error("Duplicate txHash: admin-debit:key"));

    const req = new Request("http://localhost:3000/api/admin/ledger", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", amount: "10", idempotencyKey: "key" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(409);
  });

  test("PATCH debits approved user and writes audit log", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      status: "APPROVED",
      address: "0xabc",
    });

    (debitWallet as unknown as jest.Mock).mockResolvedValue({
      transactionId: "t2",
      previousBalance: "20",
      newBalance: "10",
    });

    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/ledger", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", amount: "10", type: "SEND" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(debitWallet).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
