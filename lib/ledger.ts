/**
 * Internal Ledger Module
 * ─────────────────────
 * All wallet balance mutations MUST go through this module.
 *
 * Guarantees:
 * - Database transactions
 * - Row-level locking on Postgres via SELECT ... FOR UPDATE
 * - Atomic balance updates (no silent mutations)
 * - Every debit/credit creates both Transaction + AuditLog records
 */

import { prisma } from "@/lib/db";
import type { TransactionType, TransactionStatus } from "@prisma/client";

/* ─── Types ─── */

export interface LedgerEntry {
  userId: string;
  asset: string;
  amount: string; // base-10 integer string
  chainId: number;
  type: TransactionType;
  status?: TransactionStatus;
  txHash?: string;
  from?: string;
  to?: string;
  meta?: Record<string, unknown>;
}

export interface LedgerResult {
  walletBalanceId: string;
  previousBalance: string;
  newBalance: string;
  transactionId: string;
}

/* ─── Helpers ─── */

function assertIntString(value: string, field: string) {
  if (typeof value !== "string" || value.length === 0 || !/^[0-9]+$/.test(value)) {
    throw new Error(`${field} must be a base-10 integer string`);
  }
}

function addBigInt(a: string, b: string): string {
  return (BigInt(a) + BigInt(b)).toString();
}

function subBigInt(a: string, b: string): string {
  return (BigInt(a) - BigInt(b)).toString();
}

async function ensureWalletBalanceRow(tx: any, userId: string, asset: string) {
  return tx.walletBalance.upsert({
    where: { userId_asset: { userId, asset } },
    create: { userId, asset, balance: "0" },
    update: {},
  });
}

async function lockWalletBalanceRow(tx: any, userId: string, asset: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; balance: string }>>`
    SELECT "id", "balance"
    FROM "WalletBalance"
    WHERE "userId" = ${userId} AND "asset" = ${asset}
    FOR UPDATE
  `;

  const row = rows[0];
  if (!row) throw new Error(`No WalletBalance for user ${userId} asset ${asset}`);
  return row;
}

/* ─── Public Core API ─── */

export async function createWallet(userId: string, asset: string) {
  const wb = await prisma.walletBalance.upsert({
    where: { userId_asset: { userId, asset } },
    create: { userId, asset, balance: "0" },
    update: {},
  });
  return { walletBalanceId: wb.id, balance: wb.balance };
}

export async function getBalance(userId: string, asset: string): Promise<string> {
  const wb = await prisma.walletBalance.findUnique({
    where: { userId_asset: { userId, asset } },
    select: { balance: true },
  });
  return wb?.balance ?? "0";
}

/* ─── Ledger Mutations ─── */

export async function creditWallet(entry: LedgerEntry): Promise<LedgerResult> {
  assertIntString(entry.amount, "amount");
  if (BigInt(entry.amount) <= BigInt(0)) throw new Error("Credit amount must be positive");

  // Idempotency check (txHash is unique in schema)
  if (entry.txHash) {
    const existing = await prisma.transaction.findFirst({ where: { txHash: entry.txHash } });
    if (existing) throw new Error(`Duplicate txHash: ${entry.txHash}`);
  }

  return prisma.$transaction(async (tx: any) => {
    await ensureWalletBalanceRow(tx, entry.userId, entry.asset);
    const locked = await lockWalletBalanceRow(tx, entry.userId, entry.asset);

    const previousBalance = locked.balance;
    const newBalance = addBigInt(previousBalance, entry.amount);

    await tx.walletBalance.update({ where: { id: locked.id }, data: { balance: newBalance } });

    const transaction = await tx.transaction.create({
      data: {
        userId: entry.userId,
        type: entry.type,
        status: entry.status ?? "CONFIRMED",
        asset: entry.asset,
        amount: entry.amount,
        txHash: entry.txHash ?? null,
        chainId: entry.chainId,
        from: entry.from ?? null,
        to: entry.to ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: entry.userId,
        actor: "LEDGER",
        action: `CREDIT_${entry.type}`,
        meta: JSON.stringify({
          asset: entry.asset,
          amount: entry.amount,
          previousBalance,
          newBalance,
          txHash: entry.txHash,
          ...entry.meta,
        }),
      },
    });

    return {
      walletBalanceId: locked.id,
      previousBalance,
      newBalance,
      transactionId: transaction.id,
    };
  });
}

export async function debitWallet(entry: LedgerEntry): Promise<LedgerResult> {
  assertIntString(entry.amount, "amount");
  if (BigInt(entry.amount) <= BigInt(0)) throw new Error("Debit amount must be positive");

  return prisma.$transaction(async (tx: any) => {
    await ensureWalletBalanceRow(tx, entry.userId, entry.asset);
    const locked = await lockWalletBalanceRow(tx, entry.userId, entry.asset);

    const previousBalance = locked.balance;
    if (BigInt(previousBalance) < BigInt(entry.amount)) {
      throw new Error(`Insufficient balance: have ${previousBalance}, need ${entry.amount}`);
    }

    const newBalance = subBigInt(previousBalance, entry.amount);
    await tx.walletBalance.update({ where: { id: locked.id }, data: { balance: newBalance } });

    const transaction = await tx.transaction.create({
      data: {
        userId: entry.userId,
        type: entry.type,
        status: entry.status ?? "CONFIRMED",
        asset: entry.asset,
        amount: entry.amount,
        txHash: entry.txHash ?? null,
        chainId: entry.chainId,
        from: entry.from ?? null,
        to: entry.to ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: entry.userId,
        actor: "LEDGER",
        action: `DEBIT_${entry.type}`,
        meta: JSON.stringify({
          asset: entry.asset,
          amount: entry.amount,
          previousBalance,
          newBalance,
          txHash: entry.txHash,
          ...entry.meta,
        }),
      },
    });

    return {
      walletBalanceId: locked.id,
      previousBalance,
      newBalance,
      transactionId: transaction.id,
    };
  });
}

export async function transferInternal(opts: {
  fromUserId: string;
  toUserId: string;
  asset: string;
  amount: string;
  chainId: number;
  meta?: Record<string, unknown>;
}): Promise<{ debit: LedgerResult; credit: LedgerResult }> {
  assertIntString(opts.amount, "amount");
  if (BigInt(opts.amount) <= BigInt(0)) throw new Error("Transfer amount must be positive");

  return prisma.$transaction(async (tx: any) => {
    const [senderWallet, receiverWallet] = await Promise.all([
      tx.wallet.findUnique({ where: { userId: opts.fromUserId } }),
      tx.wallet.findUnique({ where: { userId: opts.toUserId } }),
    ]);

    if (!senderWallet) throw new Error(`No wallet for sender ${opts.fromUserId}`);
    if (!receiverWallet) throw new Error(`No wallet for receiver ${opts.toUserId}`);

    await ensureWalletBalanceRow(tx, opts.fromUserId, opts.asset);
    await ensureWalletBalanceRow(tx, opts.toUserId, opts.asset);

    // Lock both rows in deterministic order to reduce deadlock risk
    const firstUserId = [opts.fromUserId, opts.toUserId].sort()[0];
    const secondUserId = firstUserId === opts.fromUserId ? opts.toUserId : opts.fromUserId;
    await lockWalletBalanceRow(tx, firstUserId, opts.asset);
    await lockWalletBalanceRow(tx, secondUserId, opts.asset);

    const senderLocked = await lockWalletBalanceRow(tx, opts.fromUserId, opts.asset);
    const receiverLocked = await lockWalletBalanceRow(tx, opts.toUserId, opts.asset);

    if (BigInt(senderLocked.balance) < BigInt(opts.amount)) {
      throw new Error(`Insufficient balance: have ${senderLocked.balance}, need ${opts.amount}`);
    }

    const senderPrev = senderLocked.balance;
    const senderNew = subBigInt(senderPrev, opts.amount);
    const receiverPrev = receiverLocked.balance;
    const receiverNew = addBigInt(receiverPrev, opts.amount);

    await tx.walletBalance.update({ where: { id: senderLocked.id }, data: { balance: senderNew } });
    await tx.walletBalance.update({ where: { id: receiverLocked.id }, data: { balance: receiverNew } });

    const txHash = `internal-transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const sendTx = await tx.transaction.create({
      data: {
        userId: opts.fromUserId,
        type: "SEND",
        status: "CONFIRMED",
        asset: opts.asset,
        amount: opts.amount,
        txHash,
        chainId: opts.chainId,
        to: receiverWallet.smartAccountAddress,
      },
    });

    const receiveTx = await tx.transaction.create({
      data: {
        userId: opts.toUserId,
        type: "RECEIVE",
        status: "CONFIRMED",
        asset: opts.asset,
        amount: opts.amount,
        txHash,
        chainId: opts.chainId,
        from: senderWallet.smartAccountAddress,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: opts.fromUserId,
        actor: "LEDGER",
        action: "INTERNAL_TRANSFER_SENT",
        meta: JSON.stringify({
          to: opts.toUserId,
          asset: opts.asset,
          amount: opts.amount,
          ...opts.meta,
        }),
      },
    });

    return {
      debit: {
        walletBalanceId: senderLocked.id,
        previousBalance: senderPrev,
        newBalance: senderNew,
        transactionId: sendTx.id,
      },
      credit: {
        walletBalanceId: receiverLocked.id,
        previousBalance: receiverPrev,
        newBalance: receiverNew,
        transactionId: receiveTx.id,
      },
    };
  });
}
