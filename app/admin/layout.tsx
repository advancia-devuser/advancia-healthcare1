"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Lock, Eye, EyeOff, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";

const ADMIN_TOKEN_KEY = "admin_authenticated";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check if already authenticated by trying to call a protected admin endpoint
  useEffect(() => {
    const cached = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (cached === "true") {
      // Verify the cookie is still valid
      fetch("/api/admin/stats")
        .then(res => {
          if (res.ok) {
            setIsAdmin(true);
          } else {
            sessionStorage.removeItem(ADMIN_TOKEN_KEY);
            setIsAdmin(false);
          }
        })
        .catch(() => {
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          setIsAdmin(false);
        });
    } else {
      setIsAdmin(false);
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, "true");
        setIsAdmin(true);
      } else {
        setError(data.error || "Invalid credentials. Access denied.");
        setPassword("");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    // Clear the httpOnly cookie by calling logout or just expire it
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsAdmin(false);
  };

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm border-slate-700 bg-slate-900/80 backdrop-blur text-white shadow-2xl">
          <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 rounded-t-lg" />
          <CardHeader className="text-center pt-8 space-y-3">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/30">
                <ShieldCheck className="w-7 h-7 text-white" />
              </div>
            </div>
            <CardTitle className="text-xl text-white">Admin Access Only</CardTitle>
            <CardDescription className="text-slate-400">
              This area is restricted to authorized administrators only.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 px-6 pb-8">
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
              <input
                type={showPass ? "text" : "password"}
                placeholder="Admin password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 rounded-xl pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-300"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> {error}
              </p>
            )}

            <Button
              onClick={handleLogin}
              disabled={loading || !password}
              className="w-full bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white rounded-xl border-0 shadow-lg"
            >
              {loading ? "Authenticating..." : "Enter Admin Console"}
            </Button>

            <Link href="/" className="block text-center text-xs text-slate-500 hover:text-slate-300 mt-2">
              ← Back to main site
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Admin Top Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">Admin Console</p>
              <p className="text-xs text-slate-400">SmartWallet</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/admin" className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg">Overview</Link>
              <Link href="/dashboard" className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" /> User View
              </Link>
            </nav>
            <Button
              size="sm"
              variant="outline"
              onClick={handleLogout}
              className="border-red-800 text-red-400 hover:bg-red-950/50 text-xs rounded-lg gap-1"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {children}
      </div>
    </div>
  );
}
