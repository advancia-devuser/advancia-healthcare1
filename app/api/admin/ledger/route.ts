import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { creditWallet, debitWallet } from "@/lib/ledger";
import { TransactionType } from "@prisma/client";

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

const TRANSACTION_TYPE_VALUES = new Set<TransactionType>([
  TransactionType.SEND,
  TransactionType.RECEIVE,
  TransactionType.WITHDRAW,
  TransactionType.CONVERT,
  TransactionType.BUY,
]);

function normalizeAddress(addr: string) {
  return addr.trim().toLowerCase();
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parsePositiveIntString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  try {
    return BigInt(trimmed) > BigInt(0) ? BigInt(trimmed).toString() : null;
  } catch {
    return null;
  }
}

function parseChainId(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null) {
    return fallback;
  }

  const parsed = typeof value === "number" ? Math.trunc(value) : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseTransactionType(value: unknown, fallback: TransactionType): TransactionType | null {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = normalizeNonEmptyString(value)?.toUpperCase();
  if (!normalized || !TRANSACTION_TYPE_VALUES.has(normalized as TransactionType)) {
    return null;
  }

  return normalized as TransactionType;
}

function makeAdminTxHash(prefix: string, key?: string) {
  if (!key) return undefined;
  const safe = key.replace(/[^a-zA-Z0-9:_\-\.]/g, "_").slice(0, 120);
  return `${prefix}:${safe}`;
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return badRequest("Invalid request body");
    }

    const {
      userId,
      address,
      asset,
      amount,
      chainId,
      type,
      idempotencyKey,
      note,
    } = body as {
      userId?: unknown;
      address?: unknown;
      asset?: unknown;
      amount?: unknown;
      chainId?: unknown;
      type?: unknown;
      idempotencyKey?: unknown;
      note?: unknown;
    };

    const normalizedAmount = parsePositiveIntString(amount);
    if (!normalizedAmount) return badRequest("amount must be a positive integer string");

    const normalizedAsset = normalizeNonEmptyString(asset) || "ETH";
    const normalizedUserId = normalizeNonEmptyString(userId);
    const normalizedAddress = normalizeNonEmptyString(address);
    if (!normalizedUserId && !normalizedAddress) return badRequest("userId or address is required");

    const normalizedType = parseTransactionType(type, TransactionType.RECEIVE);
    if (!normalizedType) {
      return badRequest("Invalid type. Allowed values: SEND, RECEIVE, WITHDRAW, CONVERT, BUY");
    }

    const normalizedChainId = parseChainId(chainId, 421614);
    if (!normalizedChainId) {
      return badRequest("chainId must be a positive integer");
    }

    const normalizedIdempotencyKey =
      idempotencyKey === undefined || idempotencyKey === null
        ? undefined
        : normalizeNonEmptyString(idempotencyKey) || undefined;
    if (idempotencyKey !== undefined && idempotencyKey !== null && !normalizedIdempotencyKey) {
      return badRequest("idempotencyKey must be a non-empty string");
    }

    const normalizedNote =
      note === undefined || note === null
        ? undefined
        : normalizeNonEmptyString(note);
    if (note !== undefined && note !== null && !normalizedNote) {
      return badRequest("note must be a non-empty string");
    }

    const user = normalizedUserId
      ? await prisma.user.findUnique({ where: { id: normalizedUserId } })
      : await prisma.user.findUnique({ where: { address: normalizeAddress(normalizedAddress as string) } });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.status !== "APPROVED") {
      return badRequest(`User is not approved (status=${user.status})`);
    }

    const result = await creditWallet({
      userId: user.id,
      asset: normalizedAsset,
      amount: normalizedAmount,
      chainId: normalizedChainId,
      type: normalizedType,
      status: "CONFIRMED",
      txHash: makeAdminTxHash("admin-credit", normalizedIdempotencyKey),
      meta: { note: normalizedNote },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: "ADMIN",
        action: "ADMIN_LEDGER_CREDIT",
        meta: JSON.stringify({
          asset: normalizedAsset,
          amount: normalizedAmount,
          chainId: normalizedChainId,
          type: normalizedType,
          note: normalizedNote,
          ledgerTransactionId: result.transactionId,
          previousBalance: result.previousBalance,
          newBalance: result.newBalance,
          idempotencyKey: normalizedIdempotencyKey ?? null,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      credit: result,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Duplicate txHash")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message || "Credit failed" }, { status: 500 });
    }

    return NextResponse.json({ error: "Credit failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return badRequest("Invalid request body");
    }

    const {
      userId,
      address,
      asset,
      amount,
      chainId,
      type,
      idempotencyKey,
      note,
    } = body as {
      userId?: unknown;
      address?: unknown;
      asset?: unknown;
      amount?: unknown;
      chainId?: unknown;
      type?: unknown;
      idempotencyKey?: unknown;
      note?: unknown;
    };

    const normalizedAmount = parsePositiveIntString(amount);
    if (!normalizedAmount) return badRequest("amount must be a positive integer string");

    const normalizedAsset = normalizeNonEmptyString(asset) || "ETH";
    const normalizedUserId = normalizeNonEmptyString(userId);
    const normalizedAddress = normalizeNonEmptyString(address);
    if (!normalizedUserId && !normalizedAddress) return badRequest("userId or address is required");

    const normalizedType = parseTransactionType(type, TransactionType.SEND);
    if (!normalizedType) {
      return badRequest("Invalid type. Allowed values: SEND, RECEIVE, WITHDRAW, CONVERT, BUY");
    }

    const normalizedChainId = parseChainId(chainId, 421614);
    if (!normalizedChainId) {
      return badRequest("chainId must be a positive integer");
    }

    const normalizedIdempotencyKey =
      idempotencyKey === undefined || idempotencyKey === null
        ? undefined
        : normalizeNonEmptyString(idempotencyKey) || undefined;
    if (idempotencyKey !== undefined && idempotencyKey !== null && !normalizedIdempotencyKey) {
      return badRequest("idempotencyKey must be a non-empty string");
    }

    const normalizedNote =
      note === undefined || note === null
        ? undefined
        : normalizeNonEmptyString(note);
    if (note !== undefined && note !== null && !normalizedNote) {
      return badRequest("note must be a non-empty string");
    }

    const user = normalizedUserId
      ? await prisma.user.findUnique({ where: { id: normalizedUserId } })
      : await prisma.user.findUnique({ where: { address: normalizeAddress(normalizedAddress as string) } });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.status !== "APPROVED") {
      return badRequest(`User is not approved (status=${user.status})`);
    }

    const result = await debitWallet({
      userId: user.id,
      asset: normalizedAsset,
      amount: normalizedAmount,
      chainId: normalizedChainId,
      type: normalizedType,
      status: "CONFIRMED",
      txHash: makeAdminTxHash("admin-debit", normalizedIdempotencyKey),
      meta: { note: normalizedNote },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: "ADMIN",
        action: "ADMIN_LEDGER_DEBIT",
        meta: JSON.stringify({
          asset: normalizedAsset,
          amount: normalizedAmount,
          chainId: normalizedChainId,
          type: normalizedType,
          note: normalizedNote,
          ledgerTransactionId: result.transactionId,
          previousBalance: result.previousBalance,
          newBalance: result.newBalance,
          idempotencyKey: normalizedIdempotencyKey ?? null,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      debit: result,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.message.includes("Duplicate txHash")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message || "Debit failed" }, { status: 500 });
    }

    return NextResponse.json({ error: "Debit failed" }, { status: 500 });
  }
}
