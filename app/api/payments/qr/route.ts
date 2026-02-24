import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { transferInternal } from "@/lib/ledger";

/**
 * GET /api/payments/qr?amount=...&asset=ETH
 * Generate a QR payment request (returns data for QR code).
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const amount = searchParams.get("amount");
    const asset = searchParams.get("asset") || "ETH";
    const note = searchParams.get("note") || "";

    const wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });

    if (!wallet) {
      return NextResponse.json({ error: "No wallet found" }, { status: 404 });
    }

    // Generate payment data for QR encoding
    const paymentData = {
      type: "smartwallet-pay",
      version: "1.0",
      recipient: user.address,
      smartAccount: wallet.smartAccountAddress,
      amount: amount || null,
      asset,
      note,
      chainId: wallet.chainId,
      timestamp: Date.now(),
      requestId: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    return NextResponse.json({
      qrData: JSON.stringify(paymentData),
      paymentData,
    });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/payments/qr
 * Body: { qrData: string, confirm?: boolean, pin?: string }
 *
 * When confirm=false (default): parses the QR and returns payment details for review.
 * When confirm=true: parses, executes the internal transfer, marks the PaymentRequest
 *   as PAID (if one exists for the requestId), and returns the transfer result.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();
    const { qrData, confirm = false, pin } = body;

    if (!qrData) {
      return NextResponse.json({ error: "qrData is required" }, { status: 400 });
    }

    let paymentData: any;
    try {
      paymentData = JSON.parse(qrData);
    } catch {
      return NextResponse.json({ error: "Invalid QR data" }, { status: 400 });
    }

    if (paymentData.type !== "smartwallet-pay") {
      return NextResponse.json({ error: "Unsupported QR code type" }, { status: 400 });
    }

    // Look up a persisted PaymentRequest for this requestId (if any)
    const persistedRequest = paymentData.requestId
      ? await prisma.paymentRequest.findUnique({
          where: { requestId: paymentData.requestId },
        })
      : null;

    // Validate persisted request state
    if (persistedRequest) {
      if (persistedRequest.status === "PAID") {
        return NextResponse.json({ error: "This payment request has already been paid" }, { status: 409 });
      }
      if (persistedRequest.status === "CANCELLED") {
        return NextResponse.json({ error: "This payment request has been cancelled" }, { status: 410 });
      }
      if (persistedRequest.expiresAt && persistedRequest.expiresAt < new Date()) {
        // Mark expired
        await prisma.paymentRequest.update({
          where: { id: persistedRequest.id },
          data: { status: "EXPIRED" },
        });
        return NextResponse.json({ error: "This payment request has expired" }, { status: 410 });
      }
    }

    // --- Parse-only mode (default) ---
    if (!confirm) {
      return NextResponse.json({
        parsed: true,
        recipient: paymentData.recipient,
        amount: paymentData.amount,
        asset: paymentData.asset || "ETH",
        note: paymentData.note || null,
        chainId: paymentData.chainId,
        requestId: paymentData.requestId,
        hasPersistedRequest: !!persistedRequest,
      });
    }

    // --- Confirm + Execute mode ---
    if (!paymentData.amount) {
      return NextResponse.json(
        { error: "QR code has no fixed amount. Use the Send form instead." },
        { status: 400 }
      );
    }

    const recipientAddress: string = paymentData.recipient;
    if (!recipientAddress) {
      return NextResponse.json({ error: "Recipient address missing from QR data" }, { status: 400 });
    }

    // Verify PIN if user has one set
    if (user.pin) {
      const { verifyUserPin } = await import("@/lib/pin-verify");
      const pinError = await verifyUserPin(user as any, pin);
      if (pinError) return pinError;
    }

    // Find recipient
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
      return NextResponse.json({ error: "Cannot pay yourself" }, { status: 400 });
    }

    const recipientWallet = await prisma.wallet.findUnique({
      where: { userId: recipientUser.id },
    });
    if (!recipientWallet) {
      return NextResponse.json({ error: "Recipient does not have an active wallet" }, { status: 400 });
    }

    // Execute transfer
    const result = await transferInternal({
      fromUserId: user.id,
      toUserId: recipientUser.id,
      asset: paymentData.asset || "ETH",
      amount: String(paymentData.amount),
      chainId: paymentData.chainId || 421614,
      meta: {
        initiatedBy: user.address,
        recipientAddress: recipientAddress.toLowerCase(),
        source: "QR_PAYMENT",
        requestId: paymentData.requestId || null,
      },
    });

    // Mark PaymentRequest as PAID
    if (persistedRequest) {
      await prisma.paymentRequest.update({
        where: { id: persistedRequest.id },
        data: {
          status: "PAID",
          paidBy: user.address,
          paidAt: new Date(),
        },
      });
    }

    // Notifications
    const shortTo = `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`;
    const shortFrom = `${user.address.slice(0, 6)}...${user.address.slice(-4)}`;
    const assetLabel = paymentData.asset || "ETH";
    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          title: "QR Payment Sent",
          body: `You paid ${paymentData.amount} ${assetLabel} to ${shortTo}${paymentData.note ? ` (${paymentData.note})` : ""}`,
          channel: "IN_APP",
          meta: JSON.stringify({ type: "QR_PAYMENT_SENT", transactionId: result.debit.transactionId }),
        },
        {
          userId: recipientUser.id,
          title: "QR Payment Received",
          body: `You received ${paymentData.amount} ${assetLabel} from ${shortFrom}${paymentData.note ? ` (${paymentData.note})` : ""}`,
          channel: "IN_APP",
          meta: JSON.stringify({ type: "QR_PAYMENT_RECEIVED", transactionId: result.credit.transactionId }),
        },
      ],
    });

    return NextResponse.json(
      {
        paid: true,
        recipient: recipientAddress,
        amount: paymentData.amount,
        asset: assetLabel,
        note: paymentData.note || null,
        requestId: paymentData.requestId || null,
        transfer: {
          senderBalance: result.debit.newBalance,
          transactionId: result.debit.transactionId,
        },
      },
      { status: 201 }
    );
  } catch (res) {
    if (res instanceof Response) return res;
    const err = res as any;
    if (err?.message?.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
