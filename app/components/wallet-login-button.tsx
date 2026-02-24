"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthModal, useSignerStatus } from "@account-kit/react";

/**
 * Isolated Wallet Login Button.
 * This component MUST only be rendered inside AlchemyAccountProvider.
 * It is dynamically imported by login-card.tsx and guarded by alchemyAvailable context.
 */
export default function WalletLoginButton({ disabled }: { disabled: boolean }) {
  const { openAuthModal } = useAuthModal();
  const { isAuthenticating } = useSignerStatus();

  return (
    <Button
      variant="outline"
      size="lg"
      onClick={openAuthModal}
      disabled={disabled || isAuthenticating}
      className="w-full h-11 text-sm font-medium rounded-xl border-gray-200 hover:bg-gray-50 dark:border-gray-700"
    >
      {isAuthenticating ? (
        <>
          <Loader2 className="animate-spin mr-2 h-4 w-4" /> Connecting Wallet...
        </>
      ) : (
        <>
          <ShieldCheck className="w-4 h-4 mr-2 text-blue-500" />
          Sign In with Wallet / Google / Passkey
        </>
      )}
    </Button>
  );
}
