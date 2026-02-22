"use client";

import { useState } from "react";
import { Loader2, HeartPulse, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuthModal, useSignerStatus } from "@account-kit/react";
import Link from "next/link";

export default function LoginPage() {
  const { openAuthModal } = useAuthModal();
  const { isAuthenticating } = useSignerStatus();
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);

  const handleLogin = () => {
    if (!privacyAccepted) {
      setPrivacyError(true);
      return;
    }
    setPrivacyError(false);
    openAuthModal();
  };

  return (
    <Card
      className={cn(
        "relative w-full max-w-md shadow-2xl border border-gray-200/50 overflow-hidden",
        "bg-white/80 dark:bg-gray-900/80 backdrop-blur-md",
      )}
    >
      {/* Top accent bar */}
      <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

      <CardHeader className={cn("text-center space-y-3 pt-8 pb-4")}>
        <div className="flex justify-center mb-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
        </div>
        <CardTitle className={cn("text-2xl font-extrabold tracking-tight")}>
          Welcome to Advancia Healthcare
        </CardTitle>
        <CardDescription className={cn("text-sm text-muted-foreground")}>
          Sign in with Google, Email, or your Passkey to access your secure healthcare wallet.
        </CardDescription>
      </CardHeader>

      <CardContent className={cn("space-y-5 px-8 pb-2")}>
        <Button
          size="lg"
          onClick={handleLogin}
          disabled={isAuthenticating}
          className={cn(
            "w-full h-12 text-base font-semibold rounded-xl",
            "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700",
            "text-white shadow-lg hover:shadow-blue-500/30 border-0 transition-all duration-200"
          )}
        >
          {isAuthenticating ? (
            <><Loader2 className={cn("animate-spin mr-2 h-5 w-5")} /> Authenticating...</>
          ) : (
            "Sign In / Register"
          )}
        </Button>

        {/* Privacy acceptance */}
        <div className="space-y-1">
          <label className={cn("flex items-start gap-3 cursor-pointer group")}>
            <div className="mt-0.5 relative">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={e => { setPrivacyAccepted(e.target.checked); setPrivacyError(false); }}
                className="sr-only peer"
              />
              <div className={cn(
                "w-4 h-4 rounded border-2 transition-all peer-checked:bg-blue-500 peer-checked:border-blue-500 flex items-center justify-center",
                privacyError ? "border-red-500 bg-red-50" : "border-gray-300 group-hover:border-blue-400"
              )}>
                {privacyAccepted && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                    <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground leading-relaxed">
              I have read and agree to the{" "}
              <Link href="/privacy" className="text-blue-600 hover:underline font-medium">Privacy Policy</Link>
              {" "}and{" "}
              <Link href="/terms" className="text-blue-600 hover:underline font-medium">Terms of Service</Link>.
            </span>
          </label>
          {privacyError && (
            <p className="text-xs text-red-500 ml-7">You must accept the Privacy Policy to continue.</p>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex justify-center pb-6 pt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
          Secured by Alchemy Smart Wallets
        </div>
      </CardFooter>
    </Card>
  );
}
