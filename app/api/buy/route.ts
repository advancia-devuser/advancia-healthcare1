/**
 * On-Ramp API — Buy Crypto
 * ────────────────────────
 * POST /api/buy — Create a buy order and get provider widget URL
 * GET  /api/buy — List user's buy orders
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, checkRateLimit, getClientIP } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateWidgetUrl, PROVIDERS } from "@/lib/onramp-providers";
import type { OnRampProvider } from "@/lib/onramp-providers";

const DEFAULT_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "421614", 10);

/* ─── GET: List buy orders ─── */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await prisma.cryptoOrder.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ orders });
}

/* ─── POST: Create buy order ─── */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!checkRateLimit(`buy:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    provider,
    fiatAmount,
    fiatCurrency = "USD",
    cryptoAsset = "ETH",
    chainId = DEFAULT_CHAIN_ID,
  } = body;

  // Validate provider
  const validProviders: OnRampProvider[] = ["TRANSAK", "MOONPAY", "RAMP"];
  if (!provider || !validProviders.includes(provider)) {
    return NextResponse.json(
      { error: "Invalid provider. Must be one of: TRANSAK, MOONPAY, RAMP" },
      { status: 400 }
    );
  }

  // Validate fiatAmount
  const amount = parseFloat(fiatAmount);
  if (!fiatAmount || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "fiatAmount must be positive" }, { status: 400 });
  }

  // Validate against provider limits
  const providerInfo = PROVIDERS.find((p) => p.key === provider);
  if (providerInfo) {
    if (amount < providerInfo.minAmount) {
      return NextResponse.json(
        { error: `Minimum amount for ${providerInfo.name} is $${providerInfo.minAmount}` },
        { status: 400 }
      );
    }
    if (amount > providerInfo.maxAmount) {
      return NextResponse.json(
        { error: `Maximum amount for ${providerInfo.name} is $${providerInfo.maxAmount}` },
        { status: 400 }
      );
    }
  }

  // Validate crypto asset
  const supportedAssets = ["ETH", "USDC", "USDT"];
  if (!supportedAssets.includes(cryptoAsset)) {
    return NextResponse.json(
      { error: "Unsupported crypto asset. Must be ETH, USDC, or USDT" },
      { status: 400 }
    );
  }

  // Validate fiat currency
  const supportedFiat = ["USD", "EUR", "GBP", "CAD", "AUD"];
  if (!supportedFiat.includes(fiatCurrency)) {
    return NextResponse.json(
      { error: "Unsupported fiat currency" },
      { status: 400 }
    );
  }

  // Get user wallet
  const wallet = await prisma.wallet.findUnique({
    where: { userId: user.id },
  });
  if (!wallet) {
    return NextResponse.json({ error: "No wallet found. Please set up your wallet first." }, { status: 400 });
  }

  // Create order
  const order = await prisma.cryptoOrder.create({
    data: {
      userId: user.id,
      provider: provider as OnRampProvider,
      fiatCurrency,
      fiatAmount: fiatAmount.toString(),
      cryptoAsset,
      walletAddress: wallet.smartAccountAddress,
      chainId,
    },
  });

  // Generate widget URL
  const widgetUrl = generateWidgetUrl(provider, {
    walletAddress: wallet.smartAccountAddress,
    cryptoAsset,
    fiatCurrency,
    fiatAmount: fiatAmount.toString(),
    chainId,
    orderId: order.id,
    email: user.email ?? undefined,
  });

  // Update order with widget URL
  await prisma.cryptoOrder.update({
    where: { id: order.id },
    data: { widgetUrl },
  });

  // Create notification
  await prisma.notification.create({
    data: {
      userId: user.id,
      title: `Buy Order Created`,
      body: `You initiated a $${fiatAmount} ${fiatCurrency} → ${cryptoAsset} purchase via ${providerInfo?.name || provider}.`,
    },
  });

  return NextResponse.json({
    order: { ...order, widgetUrl },
    widgetUrl,
    provider: providerInfo,
  });
}
