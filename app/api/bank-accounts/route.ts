import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

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
    const body = await request.json();

    const { bankName, accountLast4, routingNumber, accountType, plaidAccessToken, plaidAccountId } = body;

    if (!bankName || !accountLast4) {
      return NextResponse.json(
        { error: "bankName and accountLast4 are required" },
        { status: 400 }
      );
    }

    const account = await prisma.bankAccount.create({
      data: {
        userId: user.id,
        bankName,
        accountLast4,
        routingNumber: routingNumber || null,
        accountType: accountType || "checking",
        plaidAccessToken: plaidAccessToken ? encrypt(plaidAccessToken) : null,
        plaidAccountId: plaidAccountId || null,
        status: plaidAccessToken ? "VERIFIED" : "PENDING_VERIFICATION",
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "BANK_ACCOUNT_LINKED",
        meta: JSON.stringify({
          bankAccountId: account.id,
          bankName,
          accountLast4,
          accountType: accountType || "checking",
        }),
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "Bank Account Linked",
        body: `${bankName} account ending in ${accountLast4} has been linked`,
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
    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const account = await prisma.bankAccount.findFirst({
      where: { id: accountId, userId: user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Bank account not found" }, { status: 404 });
    }

    await prisma.bankAccount.update({
      where: { id: accountId },
      data: { status: "REMOVED" },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "BANK_ACCOUNT_REMOVED",
        meta: JSON.stringify({ bankAccountId: accountId }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
