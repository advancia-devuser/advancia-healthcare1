import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

type AccountType = "checking" | "savings";

const ACCOUNT_TYPES = new Set<AccountType>(["checking", "savings"]);

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return normalizeNonEmptyString(value);
}

function normalizeAccountType(value: unknown): AccountType | null {
  if (value === undefined || value === null || value === "") {
    return "checking";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return ACCOUNT_TYPES.has(normalized as AccountType) ? (normalized as AccountType) : null;
}

/**
 * GET /api/bank-accounts
 * Returns user's linked bank accounts.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const accounts = await prisma.bankAccount.findMany({
      where: { userId: user.id, status: { not: "REMOVED" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        bankName: true,
        accountLast4: true,
        accountType: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ accounts });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/bank-accounts
 * Body: { bankName, accountLast4, routingNumber?, accountType?, plaidAccessToken?, plaidAccountId? }
 * Link a new bank account.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { bankName, accountLast4, routingNumber, accountType, plaidAccessToken, plaidAccountId } = body as {
      bankName?: unknown;
      accountLast4?: unknown;
      routingNumber?: unknown;
      accountType?: unknown;
      plaidAccessToken?: unknown;
      plaidAccountId?: unknown;
    };

    const normalizedBankName = normalizeNonEmptyString(bankName);
    const normalizedAccountLast4 = normalizeNonEmptyString(accountLast4);
    const normalizedRoutingNumber = normalizeOptionalString(routingNumber);
    const normalizedAccountType = normalizeAccountType(accountType);
    const normalizedPlaidAccessToken = normalizeOptionalString(plaidAccessToken);
    const normalizedPlaidAccountId = normalizeOptionalString(plaidAccountId);

    if (!normalizedBankName || !normalizedAccountLast4) {
      return NextResponse.json(
        { error: "bankName and accountLast4 are required" },
        { status: 400 }
      );
    }

    if (!/^\d{4}$/.test(normalizedAccountLast4)) {
      return NextResponse.json({ error: "accountLast4 must be exactly 4 digits" }, { status: 400 });
    }

    if (normalizedRoutingNumber && !/^\d{9}$/.test(normalizedRoutingNumber)) {
      return NextResponse.json({ error: "routingNumber must be exactly 9 digits" }, { status: 400 });
    }

    if (!normalizedAccountType) {
      return NextResponse.json({ error: "accountType must be checking or savings" }, { status: 400 });
    }

    const account = await prisma.bankAccount.create({
      data: {
        userId: user.id,
        bankName: normalizedBankName,
        accountLast4: normalizedAccountLast4,
        routingNumber: normalizedRoutingNumber,
        accountType: normalizedAccountType,
        plaidAccessToken: normalizedPlaidAccessToken ? encrypt(normalizedPlaidAccessToken) : null,
        plaidAccountId: normalizedPlaidAccountId,
        status: normalizedPlaidAccessToken ? "VERIFIED" : "PENDING_VERIFICATION",
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "BANK_ACCOUNT_LINKED",
        meta: JSON.stringify({
          bankAccountId: account.id,
          bankName: normalizedBankName,
          accountLast4: normalizedAccountLast4,
          accountType: normalizedAccountType,
        }),
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Bank Account Linked",
        body: `${normalizedBankName} account ending in ${normalizedAccountLast4} has been linked`,
        channel: "IN_APP",
        meta: JSON.stringify({ bankAccountId: account.id }),
      },
    });

    return NextResponse.json(
      {
        account: {
          id: account.id,
          bankName: account.bankName,
          accountLast4: account.accountLast4,
          accountType: account.accountType,
          status: account.status,
          createdAt: account.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/bank-accounts
 * Body: { accountId }
 * Remove a linked bank account.
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { accountId } = body as { accountId?: unknown };
    const normalizedAccountId = normalizeNonEmptyString(accountId);

    if (!normalizedAccountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const account = await prisma.bankAccount.findFirst({
      where: { id: normalizedAccountId, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Bank account not found" }, { status: 404 });
    }

    await prisma.bankAccount.update({
      where: { id: normalizedAccountId },
      data: { status: "REMOVED" },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "BANK_ACCOUNT_REMOVED",
        meta: JSON.stringify({ bankAccountId: normalizedAccountId }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
