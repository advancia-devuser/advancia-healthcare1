import { NextResponse } from "next/server";
import { requireApprovedUser, getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
 * Body: { qrData: string }
 * Process a scanned QR payment — decodes and initiates a transfer.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();
    const { qrData } = body;

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

    // Return parsed payment info for user confirmation
    // The actual transfer happens via POST /api/transfers
    return NextResponse.json({
      parsed: true,
      recipient: paymentData.recipient,
      amount: paymentData.amount,
      asset: paymentData.asset || "ETH",
      note: paymentData.note,
      chainId: paymentData.chainId,
      requestId: paymentData.requestId,
    });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
