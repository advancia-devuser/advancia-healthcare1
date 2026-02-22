import { prisma } from "@/lib/db";
import { createWallet, creditWallet, debitWallet } from "@/lib/ledger";

const describeIfDb =
  process.env.RUN_DB_TESTS === "1" && process.env.DATABASE_URL?.startsWith("postgres")
    ? describe
    : describe.skip;

function uniqueAddress() {
  return `0x${Math.random().toString(16).slice(2).padEnd(40, "0").slice(0, 40)}`;
}

describeIfDb("Ledger integration (requires RUN_DB_TESTS=1 + Postgres)", () => {
  beforeAll(async () => {
    // quick sanity check
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("double debit prevention under concurrency", async () => {
    const address = uniqueAddress();

    const user = await prisma.user.create({
      data: {
        address,
        status: "APPROVED",
        role: "USER",
      },
    });

    await prisma.wallet.create({
      data: {
        userId: user.id,
        smartAccountAddress: address,
        chainId: 421614,
      },
    });

    await createWallet(user.id, "ETH");

    await creditWallet({
      userId: user.id,
      asset: "ETH",
      amount: "100",
      chainId: 421614,
      type: "RECEIVE",
      status: "CONFIRMED",
      txHash: `seed-${Date.now()}-${Math.random()}`,
    });

    const results = await Promise.allSettled([
      debitWallet({
        userId: user.id,
        asset: "ETH",
        amount: "80",
        chainId: 421614,
        type: "SEND",
        status: "CONFIRMED",
      }),
      debitWallet({
        userId: user.id,
        asset: "ETH",
        amount: "80",
        chainId: 421614,
        type: "SEND",
        status: "CONFIRMED",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const wb = await prisma.walletBalance.findUnique({
      where: { userId_asset: { userId: user.id, asset: "ETH" } },
      select: { balance: true },
    });

    expect(wb?.balance).toBe("20");
  });

  test("insufficient balance throws", async () => {
    const address = uniqueAddress();

    const user = await prisma.user.create({
      data: {
        address,
        status: "APPROVED",
        role: "USER",
      },
    });

    await prisma.wallet.create({
      data: {
        userId: user.id,
        smartAccountAddress: address,
        chainId: 421614,
      },
    });

    await createWallet(user.id, "ETH");

    await expect(
      debitWallet({
        userId: user.id,
        asset: "ETH",
        amount: "1",
        chainId: 421614,
        type: "SEND",
        status: "CONFIRMED",
      })
    ).rejects.toThrow(/Insufficient balance/);
  });
});
