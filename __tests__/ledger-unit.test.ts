
import { 
  creditWallet, 
  debitWallet, 
  createWallet, 
  getBalance 
} from "@/lib/ledger";
import { prisma } from "@/lib/db";

jest.mock("@/lib/db", () => ({
  prisma: {
    walletBalance: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
    $queryRaw: jest.fn(),
  },
}));

describe("Ledger Library Unit Tests", () => {
  const userId = "user-123";
  const asset = "USDC";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createWallet", () => {
    test("calls upsert and returns result", async () => {
      (prisma.walletBalance.upsert as jest.Mock).mockResolvedValue({ id: "wb-1", balance: "0" });
      const res = await createWallet(userId, asset);
      expect(res.walletBalanceId).toBe("wb-1");
      expect(prisma.walletBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_asset: { userId, asset } }
        })
      );
    });
  });

  describe("getBalance", () => {
    test("returns balance if exists", async () => {
      (prisma.walletBalance.findUnique as jest.Mock).mockResolvedValue({ balance: "100" });
      const balance = await getBalance(userId, asset);
      expect(balance).toBe("100");
    });

    test("returns 0 if not found", async () => {
      (prisma.walletBalance.findUnique as jest.Mock).mockResolvedValue(null);
      const balance = await getBalance(userId, asset);
      expect(balance).toBe("0");
    });
  });

  describe("creditWallet", () => {
    test("throws if amount is not an integer string", async () => {
      await expect(creditWallet({ userId, asset, amount: "10.5", chainId: 1, type: "RECEIVE" }))
        .rejects.toThrow("amount must be a base-10 integer string");
    });

    test("throws if amount is negative", async () => {
      await expect(creditWallet({ userId, asset, amount: "-100", chainId: 1, type: "RECEIVE" }))
        .rejects.toThrow("amount must be a base-10 integer string"); // The regex /^[0-9]+$/ handles this too
    });

    test("throws if amount is zero", async () => {
        await expect(creditWallet({ userId, asset, amount: "0", chainId: 1, type: "RECEIVE" }))
          .rejects.toThrow("Credit amount must be positive");
      });

    test("prevents duplicate txHash", async () => {
      (prisma.transaction.findFirst as jest.Mock).mockResolvedValue({ id: "t1" });
      await expect(creditWallet({ userId, asset, amount: "100", chainId: 1, type: "RECEIVE", txHash: "0xhash" }))
        .rejects.toThrow("Duplicate txHash: 0xhash");
    });

    test("successfully credits wallet", async () => {
      (prisma.transaction.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.walletBalance.upsert as jest.Mock).mockResolvedValue({ id: "wb-1", balance: "50" });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: "wb-1", balance: "50" }]);
      (prisma.transaction.create as jest.Mock).mockResolvedValue({ id: "new-t" });

      const res = await creditWallet({
        userId,
        asset,
        amount: "100",
        chainId: 1,
        type: "RECEIVE",
      });

      expect(res.newBalance).toBe("150");
      expect(prisma.walletBalance.update).toHaveBeenCalledWith({
        where: { id: "wb-1" },
        data: { balance: "150" }
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "CREDIT_RECEIVE"
          })
        })
      );
    });
  });

  describe("debitWallet", () => {
    test("throws on insufficient balance", async () => {
      (prisma.walletBalance.upsert as jest.Mock).mockResolvedValue({ id: "wb-1", balance: "50" });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: "wb-1", balance: "50" }]);

      await expect(debitWallet({
        userId,
        asset,
        amount: "100",
        chainId: 1,
        type: "SEND"
      })).rejects.toThrow("Insufficient balance: have 50, need 100");
    });

    test("successfully debits wallet", async () => {
      (prisma.walletBalance.upsert as jest.Mock).mockResolvedValue({ id: "wb-1", balance: "200" });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: "wb-1", balance: "200" }]);
      (prisma.transaction.create as jest.Mock).mockResolvedValue({ id: "new-t" });

      const res = await debitWallet({
        userId,
        asset,
        amount: "50",
        chainId: 1,
        type: "SEND"
      });

      expect(res.newBalance).toBe("150");
      expect(prisma.walletBalance.update).toHaveBeenCalledWith({
        where: { id: "wb-1" },
        data: { balance: "150" }
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "DEBIT_SEND"
          })
        })
      );
    });
  });

  describe("Locking logic", () => {
    test("throws if row missing after upsert (edge case)", async () => {
      (prisma.walletBalance.upsert as jest.Mock).mockResolvedValue({ id: "wb-1" });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]); // Simulate missing row on lock

      await expect(creditWallet({ userId, asset, amount: "100", chainId: 1, type: "RECEIVE" }))
        .rejects.toThrow(`No WalletBalance for user ${userId} asset ${asset}`);
    });
  });
});
