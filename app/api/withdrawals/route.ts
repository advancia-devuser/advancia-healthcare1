import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyUserPin } from "@/lib/pin-verify";

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/**
 * GET /api/withdrawals?page=1&limit=20
 * User: list own withdrawals.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInt(searchParams.get("limit"), 20));

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.withdrawal.count({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({ withdrawals, total, page, limit });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/withdrawals
 * Body: { amount, asset?, toAddress, chainId }
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { amount, asset, toAddress, chainId, pin } = body as {
      amount?: unknown;
      asset?: unknown;
      toAddress?: unknown;
      chainId?: unknown;
      pin?: unknown;
    };

    if (amount === undefined || amount === null || toAddress === undefined || toAddress === null || chainId === undefined || chainId === null) {
      return NextResponse.json(
        { error: "amount, toAddress, and chainId are required" },
        { status: 400 }
      );
    }

    const normalizedAmount = String(amount).trim();
    const numericAmount = Number(normalizedAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    if (typeof toAddress !== "string" || !toAddress.trim()) {
      return NextResponse.json(
        { error: "toAddress must be a non-empty string" },
        { status: 400 }
      );
    }

    const parsedChainId =
      typeof chainId === "number" ? chainId : Number.parseInt(String(chainId), 10);

    if (!Number.isInteger(parsedChainId) || parsedChainId <= 0) {
      return NextResponse.json(
        { error: "chainId must be a positive integer" },
        { status: 400 }
      );
    }

    if (asset !== undefined && asset !== null && (typeof asset !== "string" || !asset.trim())) {
      return NextResponse.json(
        { error: "asset must be a non-empty string when provided" },
        { status: 400 }
      );
    }

    const normalizedPin = typeof pin === "string" ? pin : undefined;

    // Require PIN for withdrawals
    const pinError = await verifyUserPin(user, normalizedPin);
    if (pinError) return pinError;

    const withdrawal = await prisma.withdrawal.create({
      data: {
        userId: user.id,
        amount: normalizedAmount,
        asset: typeof asset === "string" ? asset.trim() : "ETH",
        toAddress: toAddress.trim(),
        chainId: parsedChainId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "WITHDRAWAL_REQUESTED",
        meta: JSON.stringify({ amount: normalizedAmount, asset: typeof asset === "string" ? asset.trim() : "ETH", toAddress: toAddress.trim(), chainId: parsedChainId }),
      },
    });

    return NextResponse.json({ withdrawal }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
