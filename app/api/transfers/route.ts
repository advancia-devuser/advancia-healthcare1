import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { transferInternal } from "@/lib/ledger";
import { verifyUserPin } from "@/lib/pin-verify";

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
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
    const parsed = BigInt(trimmed);
    return parsed > BigInt(0) ? parsed.toString() : null;
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

/**
 * GET /api/transfers?page=1&limit=20
 * Returns the user's P2P transfer history (both sent and received).
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInt(searchParams.get("limit"), 20));

    const wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });

    if (!wallet) {
      return NextResponse.json({ transfers: [], total: 0 });
    }

    // Get SEND and RECEIVE transactions that are internal transfers
    const [transfers, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          type: { in: ["SEND", "RECEIVE"] },
          txHash: { startsWith: "internal-transfer-" },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({
        where: {
          userId: user.id,
          type: { in: ["SEND", "RECEIVE"] },
          txHash: { startsWith: "internal-transfer-" },
        },
      }),
    ]);

    return NextResponse.json({ transfers, total, page, limit });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/transfers
 * Body: { recipientAddress: string, amount: string, asset?: string, chainId?: number }
 * Execute P2P transfer via internal ledger.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { recipientAddress, amount, asset, chainId, pin } = body as {
      recipientAddress?: unknown;
      amount?: unknown;
      asset?: unknown;
      chainId?: unknown;
      pin?: unknown;
    };

    const normalizedRecipientAddress = normalizeNonEmptyString(recipientAddress)?.toLowerCase();
    if (!normalizedRecipientAddress) {
      return NextResponse.json(
        { error: "recipientAddress is required" },
        { status: 400 }
      );
    }

    const normalizedAmount = parsePositiveIntString(amount);
    if (!normalizedAmount) {
      return NextResponse.json(
        { error: "amount must be a positive integer string" },
        { status: 400 }
      );
    }

    const normalizedAsset = normalizeNonEmptyString(asset) || "ETH";
    const normalizedChainId = parseChainId(chainId, 421614);
    if (!normalizedChainId) {
      return NextResponse.json(
        { error: "chainId must be a positive integer" },
        { status: 400 }
      );
    }

    if (pin !== undefined && pin !== null && typeof pin !== "string") {
      return NextResponse.json(
        { error: "pin must be a string" },
        { status: 400 }
      );
    }

    // Require PIN for transfers (if user has PIN set)
    const pinError = await verifyUserPin({ id: user.id, pin: user.pin }, pin);
    if (pinError) return pinError;

    // Find recipient user
    const recipientUser = await prisma.user.findUnique({
      where: { address: normalizedRecipientAddress },
    });

    if (!recipientUser) {
      return NextResponse.json(
        { error: "Recipient not found. They must have a registered wallet." },
        { status: 404 }
      );
    }

    if (recipientUser.id === user.id) {
      return NextResponse.json(
        { error: "Cannot transfer to yourself" },
        { status: 400 }
      );
    }

    // Check recipient has a wallet
    const recipientWallet = await prisma.wallet.findUnique({
      where: { userId: recipientUser.id },
    });

    if (!recipientWallet) {
      return NextResponse.json(
        { error: "Recipient does not have an active wallet" },
        { status: 400 }
      );
    }

    // Execute atomic transfer via ledger
    const result = await transferInternal({
      fromUserId: user.id,
      toUserId: recipientUser.id,
      asset: normalizedAsset,
      amount: normalizedAmount,
      chainId: normalizedChainId,
      meta: {
        initiatedBy: user.address,
        recipientAddress: normalizedRecipientAddress,
      },
    });

    // Create notifications for both parties
    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          title: "Transfer Sent",
          body: `You sent ${normalizedAmount} ${normalizedAsset} to ${normalizedRecipientAddress.slice(0, 6)}...${normalizedRecipientAddress.slice(-4)}`,
          channel: "IN_APP",
          meta: JSON.stringify({ type: "TRANSFER_SENT", transactionId: result.debit.transactionId }),
        },
        {
          userId: recipientUser.id,
          title: "Transfer Received",
          body: `You received ${normalizedAmount} ${normalizedAsset} from ${user.address.slice(0, 6)}...${user.address.slice(-4)}`,
          channel: "IN_APP",
          meta: JSON.stringify({ type: "TRANSFER_RECEIVED", transactionId: result.credit.transactionId }),
        },
      ],
    });

    return NextResponse.json(
      {
        transfer: {
          senderBalance: result.debit.newBalance,
          recipientBalance: result.credit.newBalance,
          transactionId: result.debit.transactionId,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    // Handle known ledger errors gracefully
    if (err instanceof Error && err.message.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
