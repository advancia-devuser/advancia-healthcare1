"use client";

import { useSignerStatus } from "@account-kit/react";
import LoginCard from "./components/login-card";
import Header from "./components/header";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2, HelpCircle, MessageCircle, Shield, Activity,
  HeartPulse, Loader2, CreditCard, ArrowRightLeft, Lock,
  Fingerprint, Globe, Zap, UserCheck, BarChart3, Bell
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const signerStatus = useSignerStatus();
  const router = useRouter();

  useEffect(() => {
    if (signerStatus.isConnected) {
      router.push("/dashboard");
    }
  }, [signerStatus.isConnected, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <Header />
      <main>
        {/* ═══════════ HERO / CTA ═══════════ */}
        <section className="container mx-auto px-4 text-center py-24 lg:py-32 space-y-6">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.svg"
              alt="Advancia Healthcare"
              width={80}
              height={80}
              priority
              className="drop-shadow-xl"
            />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight lg:text-7xl">
            Welcome to{" "}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
              Advancia Healthcare
            </span>
          </h1>
          <p className="text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto font-medium">
            Your secure healthcare wallet and management platform. Manage your health cards, medical bills, and wellness reminders in one place.
          </p>
          <div className="flex justify-center gap-4 pt-8 min-h-[100px]">
            {signerStatus.isInitializing || signerStatus.isAuthenticating || signerStatus.isConnected ? (
              <div className="flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading your secure wallet...</p>
              </div>
            ) : (
              <div className="w-full max-w-md mx-auto">
                <LoginCard />
              </div>
            )}
          </div>
        </section>

        {/* ═══════════ FEATURES / BENEFITS ═══════════ */}
        <section className="bg-muted/40 py-24" id="features">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-4">Platform Features</h2>
            <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16">
              Everything you need to manage, grow, and protect your digital assets — in one secure platform.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { icon: Activity, title: "Smart Wallets", desc: "Gasless transactions powered by Account Abstraction. No seed phrases, no gas fees." },
                { icon: CreditCard, title: "Virtual Cards", desc: "Instant virtual debit cards. Spend crypto anywhere cards are accepted worldwide." },
                { icon: ArrowRightLeft, title: "Crypto Converter", desc: "Swap between assets instantly with competitive rates via integrated aggregators." },
                { icon: HeartPulse, title: "Health Module", desc: "Store encrypted health cards, pay medical bills, and manage wellness reminders." },
                { icon: BarChart3, title: "Installment Plans", desc: "Split large purchases into manageable monthly payments with flexible terms." },
                { icon: Bell, title: "Smart Notifications", desc: "Real-time alerts for deposits, withdrawals, reminders, and account activity." },
              ].map((f, i) => (
                <div key={i} className="p-6 bg-card rounded-2xl shadow-sm border hover:shadow-md hover:border-primary/30 transition-all group">
                  <f.icon className="w-12 h-12 text-primary mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
                  <p className="text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════ HOW IT WORKS / WORKFLOW ═══════════ */}
        <section className="container mx-auto px-4 py-24" id="how-it-works">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-4">How It Works</h2>
          <p className="text-muted-foreground text-center max-w-xl mx-auto mb-16">
            Get started in minutes — no blockchain expertise required.
          </p>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", icon: UserCheck, title: "Sign Up", desc: "Create your account using email, passkey, or social login — no seed phrase needed." },
              { step: "02", icon: Shield, title: "Get Approved", desc: "Admin reviews your account for compliance. You'll be notified once approved." },
              { step: "03", icon: Zap, title: "Fund & Transact", desc: "Deposit crypto, swap assets, send transfers, and request virtual cards — all gasless." },
              { step: "04", icon: Globe, title: "Spend Anywhere", desc: "Use your virtual card or crypto balance worldwide. Track everything from your dashboard." },
            ].map((s, i) => (
              <div key={i} className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <s.icon className="w-8 h-8 text-white" />
                </div>
                <div className="text-xs font-bold text-primary tracking-widest">{s.step}</div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════ SECURITY & TRUST ═══════════ */}
        <section className="bg-gradient-to-br from-gray-900 to-gray-950 text-white py-24" id="security">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-4">Security &amp; Trust</h2>
            <p className="text-gray-400 text-center max-w-xl mx-auto mb-16">
              Enterprise-grade security for every transaction. Your assets and data are protected at every layer.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { icon: Lock, title: "AES-256 Encryption", desc: "Private keys and health data encrypted at rest with military-grade AES-256-GCM." },
                { icon: Fingerprint, title: "Biometric & 2FA", desc: "Passkey login, TOTP two-factor authentication, and transaction PIN for sensitive actions." },
                { icon: Shield, title: "JWT Session Tokens", desc: "Signed, httpOnly session cookies with automatic expiry. No spoofable headers." },
                { icon: BarChart3, title: "Audit Logging", desc: "Every sensitive action is logged with actor, timestamp, and IP — fully traceable." },
                { icon: Activity, title: "Rate Limiting", desc: "In-memory rate limiting on all auth endpoints to prevent brute-force attacks." },
                { icon: CheckCircle2, title: "Admin Review", desc: "All user accounts, withdrawals, and card requests require admin approval before processing." },
              ].map((s, i) => (
                <div key={i} className="p-6 bg-white/5 rounded-2xl border border-white/10 hover:border-blue-500/40 transition-all">
                  <s.icon className="w-10 h-10 text-blue-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════ FAQ ═══════════ */}
        <section className="container mx-auto px-4 py-24" id="faq">
          <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <div className="max-w-3xl mx-auto space-y-6">
            {[
              { q: "What is a Smart Wallet?", a: "A Smart Wallet uses smart contracts to provide advanced features like gasless transactions, social recovery, and enhanced security — no seed phrases required." },
              { q: "How do I get a virtual card?", a: "Once your account is approved by an admin, you can request a virtual card directly from your dashboard. It's funded from your wallet balance." },
              { q: "Are my funds secure?", a: "Yes. We use AES-256-GCM encryption, JWT signed sessions, TOTP 2FA, transaction PINs, and full audit logging to protect your assets." },
              { q: "What about health data privacy?", a: "Health card data is encrypted with AES-256-GCM before storage. Access requires authentication and all actions are audit-logged." },
              { q: "Is there a transaction fee?", a: "Transactions are gasless — we sponsor gas fees via Alchemy Account Abstraction. There may be small conversion spreads on swaps." },
            ].map((faq, i) => (
              <div key={i} className="p-6 bg-card rounded-xl shadow-sm border">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-primary" />
                  {faq.q}
                </h3>
                <p className="text-muted-foreground mt-2 ml-7">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════ SUPPORT CTA ═══════════ */}
        <section className="bg-muted/40 py-20 text-center" id="support">
          <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Our support team is available 24/7 to assist you with your wallet, cards, health module, or any other inquiries.
          </p>
          <Button variant="outline" size="lg" className="gap-2">
            <MessageCircle className="w-5 h-5" />
            Start Live Chat
          </Button>
        </section>

        {/* ═══════════ FOOTER ═══════════ */}
        <footer className="border-t bg-background">
          <div className="container mx-auto px-4 py-12">
            <div className="grid md:grid-cols-4 gap-8">
              {/* Brand column */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Image src="/logo.svg" alt="SmartWallet" width={28} height={28} />
                  <span className="font-bold bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
                    SmartWallet
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your Money. Your Control.<br />
                  The future of digital finance.
                </p>
              </div>

              {/* Product links */}
              <div>
                <h4 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Product</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/#features" className="text-muted-foreground hover:text-primary transition-colors">Features</Link></li>
                  <li><Link href="/#how-it-works" className="text-muted-foreground hover:text-primary transition-colors">How It Works</Link></li>
                  <li><Link href="/#security" className="text-muted-foreground hover:text-primary transition-colors">Security</Link></li>
                  <li><Link href="/#faq" className="text-muted-foreground hover:text-primary transition-colors">FAQ</Link></li>
                </ul>
              </div>

              {/* Legal links */}
              <div>
                <h4 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Legal</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/privacy" className="text-muted-foreground hover:text-primary transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="text-muted-foreground hover:text-primary transition-colors">Terms of Service</Link></li>
                </ul>
              </div>

              {/* Contact / social */}
              <div>
                <h4 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">Connect</h4>
                <ul className="space-y-2 text-sm">
                  <li><Link href="/#support" className="text-muted-foreground hover:text-primary transition-colors">Support</Link></li>
                  <li><a href="mailto:support@smartwallet.app" className="text-muted-foreground hover:text-primary transition-colors">support@smartwallet.app</a></li>
                </ul>
              </div>
            </div>

            <div className="border-t mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-xs text-muted-foreground">
                &copy; {new Date().getFullYear()} SmartWallet. All rights reserved.
              </p>
              <p className="text-xs text-muted-foreground">
                Powered by Alchemy Account Kit &bull; Built with Next.js
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
