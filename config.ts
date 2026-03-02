import {
  cookieStorage,
  createConfig,
} from "@account-kit/react";
import { QueryClient } from "@tanstack/react-query";
import { chainNFTMintContractData } from "@/lib/chains";
import { alchemy } from "@account-kit/infra";

const API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || "missing-api-key";
const SPONSORSHIP_POLICY_ID = process.env.NEXT_PUBLIC_ALCHEMY_POLICY_ID || "missing-policy-id";

const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? '') || 421614;
const chain = chainNFTMintContractData[CHAIN_ID]?.chain;
if (!chain && typeof window !== "undefined") {
    // Invalid chain ID - will fallback to default chain
}
const fallbackChain = chain || chainNFTMintContractData[421614]?.chain;

const uiConfig = {
  illustrationStyle: "outline",
  auth: {
    sections: [
      [{ type: "email" }],
      [
        { type: "passkey" },
        { type: "social", authProviderId: "google", mode: "popup" },
        // WalletConnect disabled — Account Kit v4.x has a hard dependency on
        // @walletconnect/keyvaluestorage which uses Node.js 'unstorage' that
        // fails in Next.js 15 webpack builds. A shim is in place at
        // lib/shims/walletconnect/keyvaluestorage.ts. See that file for
        // re-enablement steps when the upstream dependency is fixed.
      ],
    ],
    addPasskeyOnSignup: false,
  },
} as const;

export const config = createConfig(
  {
    transport: alchemy({ apiKey: API_KEY }),
    chain: fallbackChain,
    ssr: true, // more about ssr: https://www.alchemy.com/docs/wallets/react/ssr
    storage: cookieStorage, // more about persisting state with cookies: https://www.alchemy.com/docs/wallets/react/ssr#persisting-the-account-state
    enablePopupOauth: true, // must be set to "true" if you plan on using popup rather than redirect in the social login flow
    policyId: SPONSORSHIP_POLICY_ID,
  },
  uiConfig
);

export const queryClient = new QueryClient();
