import { GET, POST } from "@/app/api/wallets/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createWallet } from "@/lib/ledger";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    wallet: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    walletBalance: {
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/ledger", () => ({
  createWallet: jest.fn(),
}));

describe("Wallets API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue(null);
    (prisma.walletBalance.findMany as unknown as jest.Mock).mockResolvedValue([
      { asset: "ETH", balance: "42", updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);
    (prisma.wallet.create as unknown as jest.Mock).mockResolvedValue({ id: "w1", userId: "u1" });
    (prisma.wallet.update as unknown as jest.Mock).mockResolvedValue({ id: "w1", userId: "u1" });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });
    (createWallet as unknown as jest.Mock).mockResolvedValue(undefined);
  });

  test("GET returns wallet and balances", async () => {
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "w1",
      userId: "u1",
      smartAccountAddress: "0xwallet",
      chainId: 84532,
    });

    const req = new Request("http://localhost:3000/api/wallets");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.wallet.balance).toBe("42");
    expect(json.balances).toHaveLength(1);
  });

  test("POST returns 400 for malformed JSON", async () => {
    const req = new Request("http://localhost:3000/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.wallet.create).not.toHaveBeenCalled();
  });

  test("POST returns 400 for invalid input", async () => {
    const req = new Request("http://localhost:3000/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smartAccountAddress: "", chainId: "abc" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.wallet.create).not.toHaveBeenCalled();
  });

  test("POST creates wallet with normalized fields", async () => {
    const req = new Request("http://localhost:3000/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smartAccountAddress: " 0xwallet ", chainId: "84532" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(prisma.wallet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          smartAccountAddress: "0xwallet",
          chainId: 84532,
        }),
      })
    );
    expect(createWallet).toHaveBeenCalledWith("u1", "ETH");
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("POST updates existing wallet", async () => {
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({ id: "w-existing", userId: "u1" });

    const req = new Request("http://localhost:3000/api/wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smartAccountAddress: "0xupdated", chainId: 11155111 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "w-existing" },
        data: { smartAccountAddress: "0xupdated", chainId: 11155111 },
      })
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
