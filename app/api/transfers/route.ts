import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { transferInternal } from "@/lib/ledger";
import { verifyUserPin } from "@/lib/pin-verify";

/**
 * GET /api/transfers?page=1&limit=20
 * Returns the user's P2P transfer history (both sent and received).
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

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
    const body = await request.json();

    const { recipientAddress, amount, asset, chainId, pin } = body;

    if (!recipientAddress || !amount) {
      return NextResponse.json(
        { error: "recipientAddress and amount are required" },
        { status: 400 }
      );
    }

    // Require PIN for transfers (if user has PIN set)
    const pinError = await verifyUserPin(user, pin);
    if (pinError) return pinError;

    if (BigInt(amount) <= BigInt(0)) {
      return NextResponse.json(
        { error: "Amount must be positive" },
        { status: 400 }
      );
    }

    // Find recipient user
    const recipientUser = await prisma.user.findUnique({
      where: { address: recipientAddress.toLowerCase() },
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
      asset: asset || "ETH",
      amount: String(amount),
      chainId: chainId || 421614, // default Arbitrum Sepolia
      meta: {
        initiatedBy: user.address,
        recipientAddress: recipientAddress.toLowerCase(),
      },
    });

    // Create notifications for both parties
    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          title: "Transfer Sent",
          body: `You sent ${amount} ${asset || "ETH"} to ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`,
          channel: "IN_APP",
          meta: JSON.stringify({ type: "TRANSFER_SENT", transactionId: result.debit.transactionId }),
        },
        {
          userId: recipientUser.id,
          title: "Transfer Received",
          body: `You received ${amount} ${asset || "ETH"} from ${user.address.slice(0, 6)}...${user.address.slice(-4)}`,
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
  } catch (err: any) {
    if (err instanceof Response) return err;
    // Handle known ledger errors gracefully
    if (err.message?.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
