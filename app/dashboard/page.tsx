"use client";

import Header from "../components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wallet, User, CreditCard, ShieldCheck, Activity, Clock, Loader2,
  Send, ArrowDownToLine, Mail, MessageCircle, History, Bell,
  ArrowRightLeft, PiggyBank, Receipt, Gift, Star, Plus,
  Building2, Smartphone, QrCode, X, Check, ChevronRight, AlertTriangle,
  Heart, CalendarClock, Pill, Stethoscope, FileText, Trash2,
  ShoppingCart, ExternalLink, DollarSign, TrendingUp, BadgeCheck
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/app/components/toast-provider";
import { QRCodeCanvas } from "qrcode.react";
import { Copy } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";

import OverviewTab from "./tabs/OverviewTab";
import TransfersTab from "./tabs/TransfersTab";
import BillsTab from "./tabs/BillsTab";
import BudgetsTab from "./tabs/BudgetsTab";
import CardsTab from "./tabs/CardsTab";
import HealthTab from "./tabs/HealthTab";
import SettingsTab from "./tabs/SettingsTab";
import PaymentQrModal from "../components/payment-qr-modal";

/* ─── Types ─── */
interface UserProfile {
  id: string; address: string; email?: string; name?: string;
  phone?: string; avatarUrl?: string; role: string; status: string;
  has2FA: boolean; hasPin: boolean; createdAt: string;
}

/* ─── Helper ─── */
function headers(_address: string) {
  // Auth is handled via httpOnly cookie set by AuthSync — no spoofable headers
  return { "Content-Type": "application/json" };
}

function formatBalance(wei: string | null): string {
  if (!wei) return "0.0000";
  return (parseFloat(wei) / 1e18).toFixed(4);
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

/* ─── Dashboard Tabs ─── */
type Tab = "overview" | "transfers" | "bills" | "budgets" | "cards" | "health" | "settings";

export default function Dashboard() {
  const { isLoggedIn, isLoading: authLoading, user: authUser } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loyaltyCards, setLoyaltyCards] = useState<any[]>([]);
  const [giftCards, setGiftCards] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [healthCards, setHealthCards] = useState<any[]>([]);
  const [healthTransactions, setHealthTransactions] = useState<any[]>([]);
  const [healthReminders, setHealthReminders] = useState<any[]>([]);
  const [healthReminderSummary, setHealthReminderSummary] = useState<any>(null);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form states
  const [profileForm, setProfileForm] = useState({ name: "", email: "", phone: "" });
  const [sendForm, setSendForm] = useState({ recipient: "", amount: "", asset: "ETH", pin: "" });
  const [swapForm, setSwapForm] = useState({ fromAsset: "ETH", toAsset: "USDC", fromAmount: "" });
  const [billForm, setBillForm] = useState({ billerName: "", accountNumber: "", amount: "" });
  const [budgetForm, setBudgetForm] = useState({ name: "", category: "General", limitAmount: "" });
  const [healthCardForm, setHealthCardForm] = useState({ providerName: "", cardType: "INSURANCE", cardData: "{}", expiresAt: "" });
  const [healthPayForm, setHealthPayForm] = useState({ healthCardId: "", amount: "", description: "" });
  const [healthReminderForm, setHealthReminderForm] = useState({ type: "Appointment", message: "", remindAt: "" });
  const [showOrderCardModal, setShowOrderCardModal] = useState(false);
  const [orderCardForm, setOrderCardForm] = useState({
    cardType: "VIRTUAL" as "VIRTUAL" | "PHYSICAL",
    design: "DEFAULT",
    currency: "USD",
    spendingLimit: "",
    deliveryName: "",
    deliveryAddress: "",
    deliveryCity: "",
    deliveryState: "",
    deliveryZip: "",
    deliveryCountry: "US",
    deliveryPhone: "",
  });
  const [showSendModal, setShowSendModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showPaymentQrModal, setShowPaymentQrModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyStep, setBuyStep] = useState<"select" | "configure" | "widget">("select");
  const [buyForm, setBuyForm] = useState({ provider: "" as string, fiatAmount: "", fiatCurrency: "USD", cryptoAsset: "ETH" });
  const [buyOrders, setBuyOrders] = useState<any[]>([]);
  const [buyWidgetUrl, setBuyWidgetUrl] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.push("/");
    }
  }, [isLoggedIn, authLoading, router]);

  const addr = authUser?.address || "";
  const h = useCallback(() => headers(addr), [addr]);

  // Fetch all data
  useEffect(() => {
    if (!addr) return;
    async function fetchAll() {
      setLoading(true);
      setError("");
      try {
        const [profileRes, txRes, wdRes, cardRes, notifRes, budgetRes, subRes, contactRes, loyaltyRes, giftRes, bankRes, billRes, hCardRes, hTxRes, hRemRes, buyRes, payReqRes] = await Promise.all([
          fetch("/api/profile", { headers: headers(addr) }),
          fetch("/api/transactions?limit=10", { headers: headers(addr) }),
          fetch("/api/withdrawals", { headers: headers(addr) }),
          fetch("/api/cards", { headers: headers(addr) }),
          fetch("/api/notifications?limit=5", { headers: headers(addr) }),
          fetch("/api/budgets", { headers: headers(addr) }),
          fetch("/api/subscriptions", { headers: headers(addr) }),
          fetch("/api/contacts", { headers: headers(addr) }),
          fetch("/api/loyalty-cards", { headers: headers(addr) }),
          fetch("/api/gift-cards", { headers: headers(addr) }),
          fetch("/api/bank-accounts", { headers: headers(addr) }),
          fetch("/api/bills?limit=5", { headers: headers(addr) }),
          fetch("/api/health/cards", { headers: headers(addr) }),
          fetch("/api/health/transactions?limit=10", { headers: headers(addr) }),
          fetch("/api/health/reminders", { headers: headers(addr) }),
          fetch("/api/buy", { headers: headers(addr) }),
          fetch("/api/payments/request?limit=10", { headers: headers(addr) }),
        ]);

        const profileData = await profileRes.json();
        const txData = await txRes.json();
        const wdData = await wdRes.json();
        const cardData = await cardRes.json();
        const notifData = await notifRes.json();
        const budgetData = await budgetRes.json();
        const subData = await subRes.json();
        const contactData = await contactRes.json();
        const loyaltyData = await loyaltyRes.json();
        const giftData = await giftRes.json();
        const bankData = await bankRes.json();
        const billData = await billRes.json();
        const hCardData = await hCardRes.json();
        const hTxData = await hTxRes.json();
        const hRemData = await hRemRes.json();
        const buyData = buyRes.ok ? await buyRes.json() : { orders: [] };
        const payReqData = payReqRes.ok ? await payReqRes.json() : { requests: [] };

        setProfile(profileData.user);
        setBalance(profileData.wallet?.balance ? formatBalance(profileData.wallet.balance) : "0.0000");
        setProfileForm({
          name: profileData.user?.name || "",
          email: profileData.user?.email || "",
          phone: profileData.user?.phone || "",
        });
        setTransactions(txData.transactions || []);
        setWithdrawals(wdData.withdrawals || []);
        setCards(cardData.cards || []);
        setNotifications(notifData.notifications || []);
        setUnreadCount(notifData.unreadCount || 0);
        setBudgets(budgetData.budgets || []);
        setBudgetSummary(budgetData.summary || null);
        setSubscriptions(subData.subscriptions || []);
        setContacts(contactData.contacts || []);
        setLoyaltyCards(loyaltyData.cards || []);
        setGiftCards(giftData.cards || []);
        setBankAccounts(bankData.accounts || []);
        setBills(billData.bills || []);
        setHealthCards(hCardData.cards || []);
        setHealthTransactions(hTxData.transactions || []);
        setHealthReminders(hRemData.reminders || []);
        setHealthReminderSummary(hRemData.summary || null);
        setBuyOrders(buyData.orders || []);
        setPaymentRequests(payReqData.requests || []);

        // Show welcome message if it's a new session
        if (!sessionStorage.getItem("welcomed_" + addr)) {
          setShowWelcome(true);
          sessionStorage.setItem("welcomed_" + addr, "true");
          setTimeout(() => setShowWelcome(false), 5000);
        }
      } catch {
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [addr]);

  // Actions
  async function handleQrConfirmPay(qrData: string, pin?: string): Promise<any> {
    const res = await fetch("/api/payments/qr", {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ qrData, confirm: true, pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // Refresh balance and payment requests
    setBalance(formatBalance(data.transfer?.senderBalance || "0"));
    const updatedPayReq = await fetch("/api/payments/request?limit=10", { headers: h() });
    if (updatedPayReq.ok) {
      const prData = await updatedPayReq.json();
      setPaymentRequests(prData.requests || []);
    }
    return data;
  }

  async function handleSaveProfile() {
    setActionLoading(true); setActionMsg("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH", headers: h(), body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProfile(data.user);
      setActionMsg("Profile saved!");
      toast.success("Profile saved", "Your profile has been updated.");
    } catch (e: any) { setActionMsg(e.message); toast.error("Profile save failed", e.message); } finally { setActionLoading(false); }
  }

  /* ─── Buy Crypto ─── */
  async function fetchBuyOrders() {
    try {
      const res = await fetch("/api/buy", { headers: h() });
      if (res.ok) {
        const data = await res.json();
        setBuyOrders(data.orders || []);
      }
    } catch { /* ignore */ }
  }

  async function handleBuyCrypto() {
    if (!buyForm.fiatAmount || parseFloat(buyForm.fiatAmount) <= 0) {
      toast.error("Invalid amount", "Please enter a valid amount.");
      return;
    }
    setActionLoading(true); setActionMsg("");
    try {
      const res = await fetch("/api/buy", {
        method: "POST", headers: h(),
        body: JSON.stringify({
          provider: buyForm.provider,
          fiatAmount: buyForm.fiatAmount,
          fiatCurrency: buyForm.fiatCurrency,
          cryptoAsset: buyForm.cryptoAsset,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBuyWidgetUrl(data.widgetUrl);
      setBuyStep("widget");
      toast.success("Order created", `$${buyForm.fiatAmount} ${buyForm.fiatCurrency} → ${buyForm.cryptoAsset} order placed via ${buyForm.provider}.`);
    } catch (e: any) { toast.error("Buy failed", e.message); } finally { setActionLoading(false); }
  }

  async function handleSend() {
    setActionLoading(true); setActionMsg("");
    try {
      const res = await fetch("/api/transfers", {
        method: "POST", headers: h(),
        body: JSON.stringify({
          recipientAddress: sendForm.recipient,
          amount: sendForm.amount,
          asset: sendForm.asset,
          pin: sendForm.pin || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionMsg("Transfer sent!");
      toast.success("Transfer sent", `${sendForm.amount} ${sendForm.asset} sent successfully.`);
      setShowSendModal(false);
      setSendForm({ recipient: "", amount: "", asset: "ETH", pin: "" });
      setBalance(formatBalance(data.transfer?.senderBalance || "0"));
    } catch (e: any) { setActionMsg(e.message); toast.error("Transfer failed", e.message); } finally { setActionLoading(false); }
  }

  async function handleSwap() {
    setActionLoading(true); setActionMsg("");
    try {
      const res = await fetch("/api/conversions", {
        method: "POST", headers: h(),
        body: JSON.stringify({
          fromAsset: swapForm.fromAsset,
          toAsset: swapForm.toAsset,
          fromAmount: swapForm.fromAmount,
          chainId: 421614,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionMsg(`Swapped! Rate: ${data.rate}`);
      toast.success("Swap completed", `Rate: ${data.rate}`);
      setSwapForm({ ...swapForm, fromAmount: "" });
    } catch (e: any) { setActionMsg(e.message); toast.error("Swap failed", e.message); } finally { setActionLoading(false); }
  }

  async function handlePayBill() {
    setActionLoading(true); setActionMsg("");
    try {
      const res = await fetch("/api/bills", {
        method: "POST", headers: h(),
        body: JSON.stringify({
          billerName: billForm.billerName,
          accountNumber: billForm.accountNumber,
          amount: billForm.amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionMsg("Bill paid!");
      toast.success("Bill paid", `Payment to ${billForm.billerName} was successful.`);
      setBillForm({ billerName: "", accountNumber: "", amount: "" });
      setBills([data.bill, ...bills]);
    } catch (e: any) { setActionMsg(e.message); toast.error("Bill payment failed", e.message); } finally { setActionLoading(false); }
  }

  async function handleCreateBudget() {
    setActionLoading(true); setActionMsg("");
    try {
      const res = await fetch("/api/budgets", {
        method: "POST", headers: h(),
        body: JSON.stringify(budgetForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionMsg("Budget created!");
      toast.success("Budget created", `"${budgetForm.name}" budget is now active.`);
      setBudgetForm({ name: "", category: "General", limitAmount: "" });
      setBudgets([{ ...data.budget, percentUsed: 0, remaining: data.budget.limitAmount, isOverBudget: false }, ...budgets]);
    } catch (e: any) { setActionMsg(e.message); toast.error("Budget creation failed", e.message); } finally { setActionLoading(false); }
  }

  async function handleMarkNotificationsRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH", headers: h(),
        body: JSON.stringify({ markAllRead: true }),
      });
      setUnreadCount(0);
      setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
    } catch {}
  }

  async function handleRequestCard() {
    setActionLoading(true); setActionMsg("");
    try {
      const body: any = {
        cardType: orderCardForm.cardType,
        design: orderCardForm.design,
        currency: orderCardForm.currency,
        spendingLimit: orderCardForm.spendingLimit || undefined,
      };
      if (orderCardForm.cardType === "PHYSICAL") {
        body.deliveryName = orderCardForm.deliveryName;
        body.deliveryAddress = orderCardForm.deliveryAddress;
        body.deliveryCity = orderCardForm.deliveryCity;
        body.deliveryState = orderCardForm.deliveryState;
        body.deliveryZip = orderCardForm.deliveryZip;
        body.deliveryCountry = orderCardForm.deliveryCountry;
        body.deliveryPhone = orderCardForm.deliveryPhone;
      }
      const res = await fetch("/api/cards", {
        method: "POST", headers: h(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionMsg("Card requested!");
      toast.success("Card ordered!", orderCardForm.cardType === "PHYSICAL"
        ? "Your physical card will be shipped to your address. Allow 5-7 business days."
        : "Your virtual card request has been submitted.");
      setCards([data.card, ...cards]);
      setShowOrderCardModal(false);
      setOrderCardForm({ cardType: "VIRTUAL", design: "DEFAULT", currency: "USD", spendingLimit: "", deliveryName: "", deliveryAddress: "", deliveryCity: "", deliveryState: "", deliveryZip: "", deliveryCountry: "US", deliveryPhone: "" });
    } catch (e: any) { setActionMsg(e.message); toast.error("Card request failed", e.message); } finally { setActionLoading(false); }
  }

  async function handleCardAction(cardId: string, action: "FREEZE" | "UNFREEZE" | "CANCEL") {
    setActionLoading(true);
    try {
      const res = await fetch("/api/cards", {
        method: "PATCH", headers: h(),
        body: JSON.stringify({ cardId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCards(cards.map((c: any) => c.id === cardId ? data.card : c));
      toast.success(`Card ${action.toLowerCase()}d`, `Your card has been ${action.toLowerCase()}d.`);
    } catch (e: any) { toast.error("Action failed", e.message); } finally { setActionLoading(false); }
  }

  async function handleAddHealthCard() {
    setActionLoading(true); setActionMsg("");
    try {
      let cardData;
      try { cardData = JSON.parse(healthCardForm.cardData); } catch { cardData = {}; }
      const res = await fetch("/api/health/cards", {
        method: "POST", headers: h(),
        body: JSON.stringify({
          providerName: healthCardForm.providerName,
          cardType: healthCardForm.cardType,
          cardData,
          expiresAt: healthCardForm.expiresAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionMsg("Health card added!");
      toast.success("Health card added", `${healthCardForm.providerName} card saved.`);
      setHealthCards([{ ...data.card, cardData: {} }, ...healthCards]);
      setHealthCardForm({ providerName: "", cardType: "INSURANCE", cardData: "{}", expiresAt: "" });
    } catch (e: any) { setActionMsg(e.message); toast.error("Health card failed", e.message); } finally { setActionLoading(false); }
  }

  async function handleHealthPayment() {
    setActionLoading(true); setActionMsg("");
    try {
      const res = await fetch("/api/health/transactions", {
        method: "POST", headers: h(),
        body: JSON.stringify({
          healthCardId: healthPayForm.healthCardId || undefined,
          amount: healthPayForm.amount,
          description: healthPayForm.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionMsg("Health payment processed!");
      toast.success("Health payment processed", `$${healthPayForm.amount} payment recorded.`);
      setHealthTransactions([data.transaction, ...healthTransactions]);
      setHealthPayForm({ healthCardId: "", amount: "", description: "" });
    } catch (e: any) { setActionMsg(e.message); toast.error("Health payment failed", e.message); } finally { setActionLoading(false); }
  }

  async function handleAddReminder() {
    setActionLoading(true); setActionMsg("");
    try {
      const res = await fetch("/api/health/reminders", {
        method: "POST", headers: h(),
        body: JSON.stringify(healthReminderForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionMsg("Reminder set!");
      toast.success("Reminder set", `${healthReminderForm.type} reminder scheduled.`);
      setHealthReminders([data.reminder, ...healthReminders]);
      setHealthReminderForm({ type: "Appointment", message: "", remindAt: "" });
    } catch (e: any) { setActionMsg(e.message); toast.error("Reminder failed", e.message); } finally { setActionLoading(false); }
  }

  async function handleCompleteReminder(reminderId: string) {
    try {
      await fetch("/api/health/reminders", {
        method: "PATCH", headers: h(),
        body: JSON.stringify({ reminderId, status: "COMPLETED" }),
      });
      setHealthReminders(healthReminders.map((r) => r.id === reminderId ? { ...r, status: "COMPLETED" } : r));
    } catch {}
  }

  async function handleDeleteHealthCard(cardId: string) {
    try {
      await fetch(`/api/health/cards?cardId=${cardId}`, { method: "DELETE", headers: h() });
      setHealthCards(healthCards.filter((c) => c.id !== cardId));
      setActionMsg("Card removed");
    } catch {}
  }

  async function handleSubscribe(tier: string) {
    setActionLoading(true); setActionMsg("");
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST", headers: h(),
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActionMsg(`Subscribed to ${tier}!`);
      toast.success("Subscribed", `You are now on the ${tier} plan.`);
      setSubscriptions([data.subscription, ...subscriptions]);
    } catch (e: any) { setActionMsg(e.message); toast.error("Subscription failed", e.message); } finally { setActionLoading(false); }
  }

  if (authLoading || !isLoggedIn) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-red-500 text-lg">{error}</div>
      </div>
    );
  }

  // Pending Approval Screen
  if (profile?.status !== "APPROVED") {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col">
        <Header />
        <main className="container mx-auto px-4 py-16 flex-1 flex items-center justify-center">
          <Card className="max-w-md w-full text-center p-8 shadow-lg border-yellow-200 bg-yellow-50/30">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
              <CardTitle className="text-2xl text-yellow-800">Account Pending Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Your wallet has been connected. An administrator must approve your access before you can use the Advancia Healthcare dashboard.
              </p>
              <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
                Check Status Again
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const approvedCard = cards.find((c) => c.status === "APPROVED" && c.last4);
  const activeSub = subscriptions.find((s) => s.status === "ACTIVE");

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <Header />

      {/* Welcome Toast */}
      {showWelcome && (
        <div className="fixed top-20 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-top-5 fade-in duration-300">
          <Check className="w-5 h-5" />
          <div>
            <p className="font-bold">Welcome back!</p>
            <p className="text-sm opacity-90">Successfully signed in to Advancia Healthcare.</p>
          </div>
          <button onClick={() => setShowWelcome(false)} className="ml-4 hover:bg-green-600 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Message Toast */}
      {actionMsg && (
        <div className="fixed top-4 right-4 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <span className="text-sm">{actionMsg}</span>
          <button onClick={() => setActionMsg("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Payment QR Modal */}
      {showPaymentQrModal && (
        <PaymentQrModal onClose={() => setShowPaymentQrModal(false)} toast={toast} />
      )}

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" /> Send Crypto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Recipient Address</label>
                <input type="text" placeholder="0x..." className="w-full p-2 border rounded-md bg-background"
                  value={sendForm.recipient} onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (wei)</label>
                <input type="text" placeholder="1000000000000000" className="w-full p-2 border rounded-md bg-background"
                  value={sendForm.amount} onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Asset</label>
                <select className="w-full p-2 border rounded-md bg-background"
                  value={sendForm.asset} onChange={(e) => setSendForm({ ...sendForm, asset: e.target.value })}>
                  <option>ETH</option><option>USDC</option><option>USDT</option>
                </select>
              </div>
              {profile?.hasPin && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Transaction PIN</label>
                  <input type="password" inputMode="numeric" maxLength={6} placeholder="6-digit PIN" className="w-full p-2 border rounded-md bg-background tracking-widest"
                    value={sendForm.pin} onChange={(e) => setSendForm({ ...sendForm, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
                </div>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSend} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowSendModal(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Receive Modal */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-green-600" /> Receive Crypto</span>
                <button onClick={() => setShowReceiveModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col items-center">
              <p className="text-sm text-muted-foreground text-center">Share your wallet address or QR code to receive crypto.</p>
              <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                <QRCodeCanvas value={addr} size={200} level="H" includeMargin />
              </div>
              <div className="w-full">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Your Wallet Address</label>
                <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <p className="font-mono text-xs text-gray-800 break-all flex-1">{addr}</p>
                  <Button variant="ghost" size="sm" className="shrink-0 h-8 w-8 p-0" onClick={() => {
                    navigator.clipboard.writeText(addr);
                    toast.success("Copied", "Wallet address copied to clipboard");
                  }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3 font-medium text-center">
                ⚠️ Only send compatible tokens to this address on the correct network. Sending unsupported tokens may result in permanent loss.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Buy Crypto Modal */}
      {showBuyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-green-600" /> Buy Crypto</span>
                <button onClick={() => setShowBuyModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Step 1: Select Provider */}
              {buyStep === "select" && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Choose a provider to buy crypto with your credit card, debit card, or bank transfer.</p>

                  {/* Transak */}
                  <button className="w-full text-left p-4 border-2 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
                    onClick={() => { setBuyForm({ ...buyForm, provider: "TRANSAK" }); setBuyStep("configure"); }}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xl shadow-sm">🔷</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">Transak</span>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">150+ countries</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Credit card, debit card, bank transfer, Apple Pay</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-gray-500">Fees: 1-5%</span>
                        <p className="text-xs text-muted-foreground">2-10 min</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition" />
                    </div>
                  </button>

                  {/* MoonPay */}
                  <button className="w-full text-left p-4 border-2 rounded-xl hover:border-purple-400 hover:bg-purple-50/50 transition-all group"
                    onClick={() => { setBuyForm({ ...buyForm, provider: "MOONPAY" }); setBuyStep("configure"); }}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-700 flex items-center justify-center text-white text-xl shadow-sm">🌙</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">MoonPay</span>
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Premium</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Cards, Apple Pay, Google Pay, Samsung Pay</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-gray-500">Fees: 1-4.5%</span>
                        <p className="text-xs text-muted-foreground">1-5 min</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-purple-600 transition" />
                    </div>
                  </button>

                  {/* Ramp */}
                  <button className="w-full text-left p-4 border-2 rounded-xl hover:border-green-400 hover:bg-green-50/50 transition-all group"
                    onClick={() => { setBuyForm({ ...buyForm, provider: "RAMP" }); setBuyStep("configure"); }}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center text-white text-xl shadow-sm">⚡</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">Ramp Network</span>
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Low fees</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Bank transfer, cards, Apple Pay, instant</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-gray-500">Fees: 0.49-2.49%</span>
                        <p className="text-xs text-muted-foreground">Instant-30 min</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-green-600 transition" />
                    </div>
                  </button>

                  {/* Recent Orders */}
                  {buyOrders.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Recent Orders</h4>
                      <div className="space-y-2">
                        {buyOrders.slice(0, 3).map((order: any) => (
                          <div key={order.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                            <div className="flex items-center gap-2">
                              <span>{order.provider === "TRANSAK" ? "🔷" : order.provider === "MOONPAY" ? "🌙" : "⚡"}</span>
                              <span className="font-medium">${order.fiatAmount} → {order.cryptoAsset}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full font-medium ${
                              order.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                              order.status === "FAILED" ? "bg-red-100 text-red-700" :
                              "bg-yellow-100 text-yellow-700"
                            }`}>{order.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Configure Amount */}
              {buyStep === "configure" && (
                <div className="space-y-4">
                  <button onClick={() => setBuyStep("select")} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium">
                    ← Back to providers
                  </button>

                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${
                      buyForm.provider === "TRANSAK" ? "from-blue-500 to-blue-700" :
                      buyForm.provider === "MOONPAY" ? "from-purple-500 to-indigo-700" :
                      "from-green-500 to-emerald-700"
                    } flex items-center justify-center text-white text-lg`}>
                      {buyForm.provider === "TRANSAK" ? "🔷" : buyForm.provider === "MOONPAY" ? "🌙" : "⚡"}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{buyForm.provider === "TRANSAK" ? "Transak" : buyForm.provider === "MOONPAY" ? "MoonPay" : "Ramp Network"}</p>
                      <p className="text-xs text-muted-foreground">Crypto will be delivered to your wallet</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">You Pay</label>
                    <div className="flex gap-2">
                      <input type="number" min="5" step="1" placeholder="100" className="flex-1 p-3 border rounded-xl bg-background text-lg font-bold"
                        value={buyForm.fiatAmount} onChange={(e) => setBuyForm({ ...buyForm, fiatAmount: e.target.value })} />
                      <select className="w-24 p-3 border rounded-xl bg-background font-semibold"
                        value={buyForm.fiatCurrency} onChange={(e) => setBuyForm({ ...buyForm, fiatCurrency: e.target.value })}>
                        <option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AUD</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">You Get</label>
                    <select className="w-full p-3 border rounded-xl bg-background font-semibold"
                      value={buyForm.cryptoAsset} onChange={(e) => setBuyForm({ ...buyForm, cryptoAsset: e.target.value })}>
                      <option value="ETH">ETH (Ethereum)</option>
                      <option value="USDC">USDC (USD Coin)</option>
                      <option value="USDT">USDT (Tether)</option>
                    </select>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-xs text-blue-700">
                      <BadgeCheck className="w-4 h-4" />
                      <span>Crypto will be sent directly to your smart wallet at <span className="font-mono">{shortAddr(addr)}</span></span>
                    </div>
                  </div>

                  <Button className="w-full gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-6 text-base font-bold rounded-xl shadow-md"
                    onClick={handleBuyCrypto} disabled={actionLoading || !buyForm.fiatAmount}>
                    {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><DollarSign className="w-5 h-5" /> Buy {buyForm.cryptoAsset}</>}
                  </Button>
                </div>
              )}

              {/* Step 3: Widget */}
              {buyStep === "widget" && buyWidgetUrl && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <BadgeCheck className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <h3 className="font-bold text-green-800">Order Created!</h3>
                    <p className="text-sm text-green-700 mt-1">Complete your purchase in the provider window.</p>
                  </div>

                  <a href={buyWidgetUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-lg hover:from-blue-700 hover:to-indigo-700 transition shadow-md">
                    <ExternalLink className="w-5 h-5" /> Open {buyForm.provider === "TRANSAK" ? "Transak" : buyForm.provider === "MOONPAY" ? "MoonPay" : "Ramp"} <ExternalLink className="w-4 h-4" />
                  </a>

                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                    <p className="font-semibold">What happens next:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>Complete KYC verification (first time only)</li>
                      <li>Enter your payment details on the provider&apos;s secure page</li>
                      <li>Crypto will be delivered to your wallet within minutes</li>
                      <li>You&apos;ll receive a notification when the purchase completes</li>
                    </ul>
                  </div>

                  <Button variant="outline" className="w-full" onClick={() => { setShowBuyModal(false); fetchBuyOrders(); }}>
                    Done — Return to Dashboard
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Order Card Modal */}
      {showOrderCardModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-indigo-600" /> Order a Card</span>
                <button onClick={() => setShowOrderCardModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Card Type */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">Card Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className={`p-4 border rounded-xl text-center transition-all ${orderCardForm.cardType === "VIRTUAL" ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200" : "hover:bg-gray-50"}`}
                    onClick={() => setOrderCardForm({ ...orderCardForm, cardType: "VIRTUAL" })}
                  >
                    <Smartphone className="w-6 h-6 mx-auto mb-2 text-indigo-600" />
                    <p className="font-semibold text-sm">Virtual Card</p>
                    <p className="text-xs text-muted-foreground">Instant activation</p>
                  </button>
                  <button
                    className={`p-4 border rounded-xl text-center transition-all ${orderCardForm.cardType === "PHYSICAL" ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200" : "hover:bg-gray-50"}`}
                    onClick={() => setOrderCardForm({ ...orderCardForm, cardType: "PHYSICAL" })}
                  >
                    <CreditCard className="w-6 h-6 mx-auto mb-2 text-amber-600" />
                    <p className="font-semibold text-sm">Physical Card</p>
                    <p className="text-xs text-muted-foreground">Delivered 5-7 days</p>
                  </button>
                </div>
              </div>

              {/* Design */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">Card Design</label>
                <select className="w-full p-3 border rounded-xl bg-gray-50/50"
                  value={orderCardForm.design} onChange={(e) => setOrderCardForm({ ...orderCardForm, design: e.target.value })}>
                  <option value="DEFAULT">Classic</option>
                  <option value="PREMIUM">Premium</option>
                  <option value="PLATINUM">Platinum</option>
                  <option value="BLACK">Black Edition</option>
                </select>
              </div>

              {/* Currency & Spending Limit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Currency</label>
                  <select className="w-full p-3 border rounded-xl bg-gray-50/50"
                    value={orderCardForm.currency} onChange={(e) => setOrderCardForm({ ...orderCardForm, currency: e.target.value })}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Spending Limit</label>
                  <input type="text" placeholder="e.g., 5000" className="w-full p-3 border rounded-xl bg-gray-50/50"
                    value={orderCardForm.spendingLimit} onChange={(e) => setOrderCardForm({ ...orderCardForm, spendingLimit: e.target.value })} />
                </div>
              </div>

              {/* Delivery Address (physical only) */}
              {orderCardForm.cardType === "PHYSICAL" && (
                <div className="space-y-3 pt-3 border-t">
                  <h3 className="text-sm font-bold flex items-center gap-2"><Building2 className="w-4 h-4" /> Delivery Address</h3>
                  <input type="text" placeholder="Full Name" className="w-full p-3 border rounded-xl bg-gray-50/50"
                    value={orderCardForm.deliveryName} onChange={(e) => setOrderCardForm({ ...orderCardForm, deliveryName: e.target.value })} />
                  <input type="text" placeholder="Street Address" className="w-full p-3 border rounded-xl bg-gray-50/50"
                    value={orderCardForm.deliveryAddress} onChange={(e) => setOrderCardForm({ ...orderCardForm, deliveryAddress: e.target.value })} />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="City" className="w-full p-3 border rounded-xl bg-gray-50/50"
                      value={orderCardForm.deliveryCity} onChange={(e) => setOrderCardForm({ ...orderCardForm, deliveryCity: e.target.value })} />
                    <input type="text" placeholder="State" className="w-full p-3 border rounded-xl bg-gray-50/50"
                      value={orderCardForm.deliveryState} onChange={(e) => setOrderCardForm({ ...orderCardForm, deliveryState: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="ZIP Code" className="w-full p-3 border rounded-xl bg-gray-50/50"
                      value={orderCardForm.deliveryZip} onChange={(e) => setOrderCardForm({ ...orderCardForm, deliveryZip: e.target.value })} />
                    <select className="w-full p-3 border rounded-xl bg-gray-50/50"
                      value={orderCardForm.deliveryCountry} onChange={(e) => setOrderCardForm({ ...orderCardForm, deliveryCountry: e.target.value })}>
                      <option value="US">United States</option>
                      <option value="UK">United Kingdom</option>
                      <option value="CA">Canada</option>
                      <option value="AU">Australia</option>
                      <option value="DE">Germany</option>
                      <option value="FR">France</option>
                    </select>
                  </div>
                  <input type="tel" placeholder="Phone (optional)" className="w-full p-3 border rounded-xl bg-gray-50/50"
                    value={orderCardForm.deliveryPhone} onChange={(e) => setOrderCardForm({ ...orderCardForm, deliveryPhone: e.target.value })} />
                </div>
              )}

              <Button className="w-full h-12 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 rounded-xl mt-2"
                onClick={handleRequestCard} disabled={actionLoading || (orderCardForm.cardType === "PHYSICAL" && (!orderCardForm.deliveryName || !orderCardForm.deliveryAddress || !orderCardForm.deliveryCity || !orderCardForm.deliveryState || !orderCardForm.deliveryZip))}>
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Order ${orderCardForm.cardType === "PHYSICAL" ? "Physical" : "Virtual"} Card`}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <main className="container mx-auto px-4 py-8">
        {/* Header Row */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">My Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Welcome back, {profile?.name || shortAddr(addr)}</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-full hover:bg-muted" onClick={handleMarkNotificationsRead}>
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-4 scrollbar-hide">
          {([
            ["overview", "Overview", Activity],
            ["transfers", "Transfers", Send],
            ["bills", "Bills", Receipt],
            ["budgets", "Budgets", PiggyBank],
            ["cards", "Cards", CreditCard],
            ["health", "Health", Heart],
            ["settings", "Settings", ShieldCheck],
          ] as [Tab, string, any][]).map(([key, label, Icon]) => (
            <Button key={key} variant={activeTab === key ? "default" : "outline"} size="sm"
              onClick={() => setActiveTab(key)} className={`gap-2 whitespace-nowrap rounded-full px-6 py-5 transition-all duration-300 ${activeTab === key ? 'shadow-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-0' : 'hover:bg-blue-50 hover:text-blue-600 border-gray-200'}`}>
              <Icon className={`w-4 h-4 ${activeTab === key ? 'text-white' : 'text-gray-500'}`} />
              <span className="font-semibold">{label}</span>
            </Button>
          ))}
        </div>

        {/* ─── OVERVIEW TAB ─── */}
        {activeTab === "overview" && (
          <OverviewTab
            balance={balance}
            transactions={transactions}
            cards={cards}
            healthCards={healthCards}
            setShowSendModal={setShowSendModal}
            setShowReceiveModal={setShowReceiveModal}
            setShowBuyModal={setShowBuyModal}
            setShowPaymentQrModal={setShowPaymentQrModal}
            setBuyStep={setBuyStep}
            setBuyForm={setBuyForm}
            setBuyWidgetUrl={setBuyWidgetUrl}
          />
        )}

        {/* ─── TRANSFERS TAB ─── */}
        {activeTab === "transfers" && (
          <TransfersTab
            sendForm={sendForm}
            setSendForm={setSendForm}
            contacts={contacts}
            handleSend={handleSend}
            actionLoading={actionLoading}
            transactions={transactions}
            paymentRequests={paymentRequests}
            setPaymentRequests={setPaymentRequests}
            handleQrConfirmPay={handleQrConfirmPay}
            toast={toast}
            profile={profile}
            formatBalance={formatBalance}
          />
        )}

        {/* ─── BILLS TAB ─── */}
        {activeTab === "bills" && (
          <BillsTab
            billForm={billForm}
            setBillForm={setBillForm}
            bills={bills}
            handlePayBill={handlePayBill}
            actionLoading={actionLoading}
            formatBalance={formatBalance}
          />
        )}

        {/* ─── BUDGETS TAB ─── */}
        {activeTab === "budgets" && (
          <BudgetsTab
            budgetSummary={budgetSummary}
            budgetForm={budgetForm}
            setBudgetForm={setBudgetForm}
            budgets={budgets}
            handleCreateBudget={handleCreateBudget}
            actionLoading={actionLoading}
            formatBalance={formatBalance}
          />
        )}

        {/* ─── CARDS TAB ─── */}
        {activeTab === "cards" && (
          <CardsTab
            cards={cards}
            setShowOrderCardModal={setShowOrderCardModal}
            handleCardAction={handleCardAction}
            loyaltyCards={loyaltyCards}
            giftCards={giftCards}
          />
        )}

        {/* ─── HEALTH TAB ─── */}
        {activeTab === "health" && (
          <HealthTab
            healthCards={healthCards}
            healthTransactions={healthTransactions}
            healthReminderSummary={healthReminderSummary}
            healthCardForm={healthCardForm}
            setHealthCardForm={setHealthCardForm}
            handleAddHealthCard={handleAddHealthCard}
            handleDeleteHealthCard={handleDeleteHealthCard}
            healthPayForm={healthPayForm}
            setHealthPayForm={setHealthPayForm}
            handleHealthPayment={handleHealthPayment}
            healthReminderForm={healthReminderForm}
            setHealthReminderForm={setHealthReminderForm}
            handleAddReminder={handleAddReminder}
            healthReminders={healthReminders}
            handleCompleteReminder={handleCompleteReminder}
            actionLoading={actionLoading}
            formatBalance={formatBalance}
          />
        )}

        {/* ─── SETTINGS TAB ─── */}
        {activeTab === "settings" && (
          <SettingsTab
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            profile={profile}
            addr={addr}
            handleSaveProfile={handleSaveProfile}
            actionLoading={actionLoading}
            client={null}
            toast={toast}
          />
        )}
      </main>
    </div>
  );
}
