"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAlchemyAvailable } from "@/app/providers";

/* Dynamically import the wallet button so @account-kit/react hooks
   are never evaluated unless the component actually renders. */
const WalletLoginButton = dynamic(
  () => import("./wallet-login-button"),
  { ssr: false, loading: () => null }
);

export default function LoginPage() {
  const alchemyAvailable = useAlchemyAvailable();
  const router = useRouter();

  // Tab state: "login" | "register"
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  // Privacy
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!privacyAccepted) {
      setPrivacyError(true);
      return;
    }

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const endpoint = tab === "register" ? "/api/auth/email/register" : "/api/auth/email/login";
      const body = tab === "register"
        ? { email, password, name: name || undefined }
        : { email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        return;
      }

      // Success — redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleWalletLogin = () => {
    if (!privacyAccepted) {
      setPrivacyError(true);
      return;
    }
    setPrivacyError(false);
    // WalletLoginButton handles modal opening internally
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
          Sign in to access your secure healthcare wallet.
        </CardDescription>
      </CardHeader>

      <CardContent className={cn("space-y-4 px-8 pb-2")}>
        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
          <button
            onClick={() => { setTab("login"); setError(""); }}
            className={cn(
              "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
              tab === "login"
                ? "bg-white dark:bg-gray-700 shadow-sm text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab("register"); setError(""); }}
            className={cn(
              "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
              tab === "register"
                ? "bg-white dark:bg-gray-700 shadow-sm text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            Register
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-xl">
            {error}
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3">
          {tab === "register" && (
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Full Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:border-gray-700"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full pl-10 pr-10 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:border-gray-700"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className={cn(
              "w-full h-12 text-base font-semibold rounded-xl",
              "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700",
              "text-white shadow-lg hover:shadow-blue-500/30 border-0 transition-all duration-200"
            )}
          >
            {loading ? (
              <><Loader2 className="animate-spin mr-2 h-5 w-5" /> Please wait...</>
            ) : tab === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </Button>
        </form>

        {/* Wallet Login (Alchemy) – only shown when Alchemy is working */}
        {alchemyAvailable && (
          <>
            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white dark:bg-gray-900 px-3 text-gray-400">or</span>
              </div>
            </div>

            <WalletLoginButton disabled={!privacyAccepted} />
          </>
        )}

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
          Secured by Advancia Healthcare
        </div>
      </CardFooter>
    </Card>
  );
}
