import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { creditWallet, debitWallet } from "@/lib/ledger";

/**
 * Admin Ledger Operations (internal balances)
 *
 * POST  /api/admin/ledger  -> credit a user's internal ledger balance
 * PATCH /api/admin/ledger  -> debit a user's internal ledger balance
 *
 * Body:
 *  - userId?: string
 *  - address?: string (wallet address; used to resolve user)
 *  - asset?: string (default: ETH)
 *  - amount: string (base-10 integer)
 *  - chainId?: number (default: 421614)
 *  - type?: TransactionType (credit default: RECEIVE, debit default: SEND)
 *  - idempotencyKey?: string (optional; used as txHash)
 *  - note?: string (optional; stored in admin audit log)
 */

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeAddress(addr: string) {
  return addr.trim().toLowerCase();
}

function makeAdminTxHash(prefix: string, key?: string) {
  if (!key) return null;
  const safe = key.replace(/[^a-zA-Z0-9:_\-\.]/g, "_").slice(0, 120);
  return `${prefix}:${safe}`;
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    userId,
    address,
    asset = "ETH",
    amount,
    chainId = 421614,
    type = "RECEIVE",
    idempotencyKey,
    note,
  } = body ?? {};

  if (!amount) return badRequest("amount is required");
  if (!userId && !address) return badRequest("userId or address is required");

  const user = userId
    ? await prisma.user.findUnique({ where: { id: String(userId) } })
    : await prisma.user.findUnique({ where: { address: normalizeAddress(String(address)) } });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.status !== "APPROVED") {
    return badRequest(`User is not approved (status=${user.status})`);
  }

  try {
    const result = await creditWallet({
      userId: user.id,
      asset: String(asset),
      amount: String(amount),
      chainId: Number(chainId),
      type,
      status: "CONFIRMED",
      txHash: makeAdminTxHash("admin-credit", idempotencyKey),
      meta: { note },
    } as any);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: "ADMIN",
        action: "ADMIN_LEDGER_CREDIT",
        meta: JSON.stringify({
          asset,
          amount: String(amount),
          chainId,
          type,
          note,
          ledgerTransactionId: result.transactionId,
          previousBalance: result.previousBalance,
          newBalance: result.newBalance,
          idempotencyKey: idempotencyKey ?? null,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      credit: result,
    });
  } catch (err: any) {
    if (err.message?.includes("Duplicate txHash")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: err.message || "Credit failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    userId,
    address,
    asset = "ETH",
    amount,
    chainId = 421614,
    type = "SEND",
    idempotencyKey,
    note,
  } = body ?? {};

  if (!amount) return badRequest("amount is required");
  if (!userId && !address) return badRequest("userId or address is required");

  const user = userId
    ? await prisma.user.findUnique({ where: { id: String(userId) } })
    : await prisma.user.findUnique({ where: { address: normalizeAddress(String(address)) } });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.status !== "APPROVED") {
    return badRequest(`User is not approved (status=${user.status})`);
  }

  try {
    const result = await debitWallet({
      userId: user.id,
      asset: String(asset),
      amount: String(amount),
      chainId: Number(chainId),
      type,
      status: "CONFIRMED",
      txHash: makeAdminTxHash("admin-debit", idempotencyKey),
      meta: { note },
    } as any);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: "ADMIN",
        action: "ADMIN_LEDGER_DEBIT",
        meta: JSON.stringify({
          asset,
          amount: String(amount),
          chainId,
          type,
          note,
          ledgerTransactionId: result.transactionId,
          previousBalance: result.previousBalance,
          newBalance: result.newBalance,
          idempotencyKey: idempotencyKey ?? null,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      debit: result,
    });
  } catch (err: any) {
    if (err.message?.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err.message?.includes("Duplicate txHash")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: err.message || "Debit failed" }, { status: 500 });
  }
}
