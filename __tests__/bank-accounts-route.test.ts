import { DELETE, GET, POST } from "@/app/api/bank-accounts/route";
import { requireApprovedUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/crypto", () => ({
  encrypt: jest.fn((value: string) => `enc:${value}`),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    bankAccount: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

describe("Bank Accounts API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET returns non-removed accounts", async () => {
    (prisma.bankAccount.findMany as unknown as jest.Mock).mockResolvedValue([{ id: "a1" }]);

    const req = new Request("http://localhost:3000/api/bank-accounts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.bankAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", status: { not: "REMOVED" } } })
    );
  });

  test("GET passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const req = new Request("http://localhost:3000/api/bank-accounts");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(prisma.bankAccount.findMany).not.toHaveBeenCalled();
  });

  test("POST rejects invalid accountLast4", async () => {
    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankName: "Acme", accountLast4: "12a4" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid routing number", async () => {
    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankName: "Acme", accountLast4: "1234", routingNumber: "123" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid account type", async () => {
    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankName: "Acme", accountLast4: "1234", accountType: "brokerage" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  test("POST creates verified account when plaid token provided", async () => {
    (prisma.bankAccount.create as unknown as jest.Mock).mockResolvedValue({
      id: "a1",
      bankName: "Acme Bank",
      accountLast4: "1234",
      accountType: "savings",
      status: "VERIFIED",
      createdAt: new Date(),
    });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "log1" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n1" });

    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankName: "  Acme Bank ",
        accountLast4: "1234",
        routingNumber: "021000021",
        accountType: "SAVINGS",
        plaidAccessToken: "token-1",
        plaidAccountId: "acct-1",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(encrypt).toHaveBeenCalledWith("token-1");
    expect(prisma.bankAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bankName: "Acme Bank",
          accountLast4: "1234",
          routingNumber: "021000021",
          accountType: "savings",
          plaidAccessToken: "enc:token-1",
          status: "VERIFIED",
        }),
      })
    );
  });

  test("POST defaults to pending verification without plaid token", async () => {
    (prisma.bankAccount.create as unknown as jest.Mock).mockResolvedValue({
      id: "a2",
      bankName: "Acme",
      accountLast4: "5678",
      accountType: "checking",
      status: "PENDING_VERIFICATION",
      createdAt: new Date(),
    });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "log2" });
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({ id: "n2" });

    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankName: "Acme", accountLast4: "5678" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(prisma.bankAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_VERIFICATION" }) })
    );
  });

  test("POST passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Rate limited" }, { status: 429 })
    );

    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankName: "Acme", accountLast4: "5678" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Rate limited");
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  test("DELETE rejects missing accountId", async () => {
    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.bankAccount.findFirst).not.toHaveBeenCalled();
  });

  test("DELETE returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.bankAccount.findFirst).not.toHaveBeenCalled();
  });

  test("DELETE returns 404 when account not found", async () => {
    (prisma.bankAccount.findFirst as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "missing" }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(404);
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });

  test("DELETE soft-removes account and writes audit log", async () => {
    (prisma.bankAccount.findFirst as unknown as jest.Mock).mockResolvedValue({ id: "a1", userId: "u1" });
    (prisma.bankAccount.update as unknown as jest.Mock).mockResolvedValue({ id: "a1", status: "REMOVED" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "log3" });

    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "a1" }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(prisma.bankAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a1" }, data: { status: "REMOVED" } })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("DELETE passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Too many requests" }, { status: 429 })
    );

    const req = new Request("http://localhost:3000/api/bank-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "a1" }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
    expect(prisma.bankAccount.findFirst).not.toHaveBeenCalled();
  });
});
