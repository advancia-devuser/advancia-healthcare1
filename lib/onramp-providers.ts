/**
 * On-Ramp Provider Configurations
 * ────────────────────────────────
 * Generates widget URLs for Transak, MoonPay, and Ramp Network.
 * Each provider is opened in an iframe/popup with the user's
 * wallet address pre-filled so crypto lands directly in their wallet.
 */

export type OnRampProvider = "TRANSAK" | "MOONPAY" | "RAMP";

export interface OnRampParams {
  walletAddress: string;
  cryptoAsset: string;      // ETH, USDC, USDT
  fiatCurrency: string;     // USD, EUR, GBP
  fiatAmount: string;       // amount in fiat
  chainId: number;
  orderId: string;          // our internal order ID for webhooks
  email?: string;
}

export interface ProviderInfo {
  name: string;
  key: OnRampProvider;
  description: string;
  fees: string;
  paymentMethods: string[];
  logo: string;             // emoji or icon key
  color: string;
  minAmount: number;        // USD
  maxAmount: number;        // USD
  estimatedTime: string;
  supportedCrypto: string[];
}

/* ─── Provider Metadata ─── */

export const PROVIDERS: ProviderInfo[] = [
  {
    name: "Transak",
    key: "TRANSAK",
    description: "Buy crypto with credit card, debit card, or bank transfer. Available in 150+ countries.",
    fees: "1-5%",
    paymentMethods: ["Credit Card", "Debit Card", "Bank Transfer", "Apple Pay", "Google Pay"],
    logo: "🔷",
    color: "from-blue-500 to-blue-700",
    minAmount: 15,
    maxAmount: 50000,
    estimatedTime: "2-10 min",
    supportedCrypto: ["ETH", "USDC", "USDT", "MATIC", "BNB", "SOL"],
  },
  {
    name: "MoonPay",
    key: "MOONPAY",
    description: "Premium on-ramp trusted by leading crypto wallets. Fast card payments worldwide.",
    fees: "1-4.5%",
    paymentMethods: ["Credit Card", "Debit Card", "Apple Pay", "Google Pay", "Samsung Pay", "Bank Transfer"],
    logo: "🌙",
    color: "from-purple-500 to-indigo-700",
    minAmount: 20,
    maxAmount: 100000,
    estimatedTime: "1-5 min",
    supportedCrypto: ["ETH", "USDC", "USDT", "MATIC", "BNB"],
  },
  {
    name: "Ramp Network",
    key: "RAMP",
    description: "Low-fee on-ramp with instant bank transfers. Popular in Europe and UK.",
    fees: "0.49-2.49%",
    paymentMethods: ["Bank Transfer", "Credit Card", "Debit Card", "Apple Pay", "Google Pay"],
    logo: "⚡",
    color: "from-green-500 to-emerald-700",
    minAmount: 5,
    maxAmount: 50000,
    estimatedTime: "Instant-30 min",
    supportedCrypto: ["ETH", "USDC", "USDT", "MATIC"],
  },
];

/* ─── Network Name Mapping ─── */

const CHAIN_NETWORK: Record<number, { transak: string; moonpay: string; ramp: string }> = {
  421614: { transak: "arbitrum", moonpay: "arbitrum", ramp: "ARBITRUM" },
  84532:  { transak: "base",     moonpay: "base",     ramp: "BASE" },
  11155111: { transak: "ethereum", moonpay: "ethereum", ramp: "ETHEREUM" },
  42161:  { transak: "arbitrum", moonpay: "arbitrum", ramp: "ARBITRUM" },
  8453:   { transak: "base",     moonpay: "base",     ramp: "BASE" },
  1:      { transak: "ethereum", moonpay: "ethereum", ramp: "ETHEREUM" },
  137:    { transak: "polygon",  moonpay: "polygon",  ramp: "MATIC" },
};

/* ─── Widget URL Generators ─── */

export function getTransakUrl(params: OnRampParams): string {
  const apiKey = process.env.NEXT_PUBLIC_TRANSAK_API_KEY || "TRANSAK_STAGING_API_KEY";
  const env = process.env.NEXT_PUBLIC_TRANSAK_ENV || "STAGING";
  const network = CHAIN_NETWORK[params.chainId]?.transak || "arbitrum";

  const qs = new URLSearchParams({
    apiKey,
    environment: env,
    cryptoCurrencyCode: params.cryptoAsset,
    fiatCurrency: params.fiatCurrency,
    fiatAmount: params.fiatAmount,
    walletAddress: params.walletAddress,
    network,
    partnerOrderId: params.orderId,
    disableWalletAddressForm: "true",
    themeColor: "3B82F6",
    ...(params.email ? { email: params.email } : {}),
  });

  return `https://global${env === "STAGING" ? "-stg" : ""}.transak.com/?${qs.toString()}`;
}

export function getMoonPayUrl(params: OnRampParams): string {
  const apiKey = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || "";
  const env = process.env.NEXT_PUBLIC_MOONPAY_ENV || "sandbox";
  const baseCurrency = params.fiatCurrency.toLowerCase();
  const crypto = params.cryptoAsset.toLowerCase();
  const network = CHAIN_NETWORK[params.chainId]?.moonpay || "arbitrum";
  const currencyCode = `${crypto}_${network}`;

  const qs = new URLSearchParams({
    apiKey,
    currencyCode,
    baseCurrencyCode: baseCurrency,
    baseCurrencyAmount: params.fiatAmount,
    walletAddress: params.walletAddress,
    externalTransactionId: params.orderId,
    lockAmount: "true",
    showAllCurrencies: "false",
    showWalletAddressForm: "false",
    colorCode: "%237C3AED",
    ...(params.email ? { email: params.email } : {}),
  });

  const base = env === "sandbox"
    ? "https://buy-sandbox.moonpay.com"
    : "https://buy.moonpay.com";

  return `${base}?${qs.toString()}`;
}

export function getRampUrl(params: OnRampParams): string {
  const apiKey = process.env.NEXT_PUBLIC_RAMP_API_KEY || "";
  const network = CHAIN_NETWORK[params.chainId]?.ramp || "ARBITRUM";
  const swapAsset = `${network}_${params.cryptoAsset}`;

  const qs = new URLSearchParams({
    hostAppName: "Advancia PayLedger",
    hostLogoUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000"}/logo.png`,
    hostApiKey: apiKey,
    swapAsset,
    fiatCurrency: params.fiatCurrency,
    fiatValue: params.fiatAmount,
    userAddress: params.walletAddress,
    finalUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000"}/dashboard?buy=success`,
    ...(params.email ? { userEmailAddress: params.email } : {}),
  });

  return `https://app.ramp.network?${qs.toString()}`;
}

/* ─── Unified URL Generator ─── */

export function generateWidgetUrl(provider: OnRampProvider, params: OnRampParams): string {
  switch (provider) {
    case "TRANSAK":
      return getTransakUrl(params);
    case "MOONPAY":
      return getMoonPayUrl(params);
    case "RAMP":
      return getRampUrl(params);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
