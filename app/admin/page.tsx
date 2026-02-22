"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Activity, Search, CheckCircle, XCircle, Ban, Trash2, CreditCard, ArrowDownToLine, Clock, Wallet, Star, CalendarClock, DollarSign, PiggyBank, ArrowRightLeft, Plus } from "lucide-react";
import { useToast } from "@/app/components/toast-provider";

const statusColor: Record<string, string> = {
  APPROVED:  "bg-emerald-900/40 text-emerald-400 border border-emerald-800",
  PENDING:   "bg-yellow-900/40 text-yellow-400 border border-yellow-800",
  SUSPENDED: "bg-orange-900/40 text-orange-400 border border-orange-800",
  REJECTED:  "bg-red-900/40 text-red-400 border border-red-800",
  CONFIRMED: "bg-emerald-900/40 text-emerald-400 border border-emerald-800",
  COMPLETED: "bg-slate-700 text-slate-300 border border-slate-600",
  FAILED:    "bg-red-900/40 text-red-400 border border-red-800",
  ACTIVE:    "bg-emerald-900/40 text-emerald-400 border border-emerald-800",
  CANCELLED: "bg-red-900/40 text-red-400 border border-red-800",
  PAUSED:    "bg-orange-900/40 text-orange-400 border border-orange-800",
  NO_SHOW:   "bg-gray-700 text-gray-300 border border-gray-600",
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("users");
  const [search, setSearch] = useState("");

  // Users state
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  // Stats
  const [stats, setStats] = useState<any>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  // Withdrawals
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [wdLoading, setWdLoading] = useState(false);

  // Card requests
  const [cards, setCards] = useState<any[]>([]);
  const [cardLoading, setCardLoading] = useState(false);

  // Admin wallet
  const [adminWallets, setAdminWallets] = useState<any[]>([]);
  const [adminTxs, setAdminTxs] = useState<any[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletForm, setWalletForm] = useState({ asset: "ETH", amount: "", address: "" });

  // Subscriptions management
  const [adminSubs, setAdminSubs] = useState<any[]>([]);
  const [subSummary, setSubSummary] = useState<any>(null);
  const [subLoading, setSubLoading] = useState(false);

  // Bookings management
  const [adminBookings, setAdminBookings] = useState<any[]>([]);
  const [bookingSummary, setBookingSummary] = useState<any>(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Fetch stats
  useEffect(() => {
    fetch("/api/admin/stats")
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(() => {});
  }, [refresh]);

  // Fetch users
  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/users?search=${encodeURIComponent(search)}`)
      .then(res => res.json())
      .then(data => {
        setUsers(
          (data.users || []).map((u: any) => ({
            id: u.id,
            address: u.address,
            email: u.email || "",
            status: u.status,
            joined: u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "",
          }))
        );
        setLoading(false);
        setError("");
      })
      .catch(() => {
        setError("Failed to load users");
        setLoading(false);
      });
  }, [search, refresh]);

  // Fetch withdrawals when tab is active
  useEffect(() => {
    if (activeTab !== "withdrawals") return;
    setWdLoading(true);
    fetch("/api/admin/withdrawals")
      .then(res => res.json())
      .then(data => setWithdrawals(data.withdrawals || []))
      .catch(() => {})
      .finally(() => setWdLoading(false));
  }, [activeTab, refresh]);

  // Fetch cards when tab is active
  useEffect(() => {
    if (activeTab !== "cards") return;
    setCardLoading(true);
    fetch("/api/admin/cards")
      .then(res => res.json())
      .then(data => setCards(data.cards || []))
      .catch(() => {})
      .finally(() => setCardLoading(false));
  }, [activeTab, refresh]);

  // Fetch admin wallets when tab is active
  useEffect(() => {
    if (activeTab !== "wallet") return;
    setWalletLoading(true);
    fetch("/api/admin/wallet")
      .then(res => res.json())
      .then(data => {
        setAdminWallets(data.wallets || []);
        setAdminTxs(data.transactions || []);
      })
      .catch(() => {})
      .finally(() => setWalletLoading(false));
  }, [activeTab, refresh]);

  // Fetch subscriptions when tab is active
  useEffect(() => {
    if (activeTab !== "subscriptions") return;
    setSubLoading(true);
    fetch("/api/admin/subscriptions")
      .then(res => res.json())
      .then(data => {
        setAdminSubs(data.subscriptions || []);
        setSubSummary(data.summary || null);
      })
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, [activeTab, refresh]);

  // Fetch bookings when tab is active
  useEffect(() => {
    if (activeTab !== "bookings") return;
    setBookingLoading(true);
    fetch("/api/admin/bookings")
      .then(res => res.json())
      .then(data => {
        setAdminBookings(data.bookings || []);
        setBookingSummary(data.summary || null);
      })
      .catch(() => {})
      .finally(() => setBookingLoading(false));
  }, [activeTab, refresh]);

  const handleStatusChange = async (id: string, action: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, action }),
      });
      if (!res.ok) throw new Error("Failed to update user");
      setRefresh(r => r + 1);
      toastSuccess(`User ${action.toLowerCase()}d successfully`);
    } catch {
      setError("Failed to update user");
      toastError("Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawalAction = async (id: string, action: "APPROVE" | "REJECT") => {
    try {
      const res = await fetch("/api/admin/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withdrawalId: id, action }),
      });
      if (!res.ok) throw new Error("Failed");
      setRefresh(r => r + 1);
      toastSuccess(`Withdrawal ${action.toLowerCase()}d successfully`);
    } catch {
      setError("Failed to update withdrawal");
      toastError("Failed to update withdrawal");
    }
  };

  const handleCardAction = async (id: string, action: "APPROVE" | "REJECT") => {
    try {
      const res = await fetch("/api/admin/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: id, action, last4: action === "APPROVE" ? String(Math.floor(1000 + Math.random() * 9000)) : undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      setRefresh(r => r + 1);
      toastSuccess(`Card request ${action.toLowerCase()}d successfully`);
    } catch {
      setError("Failed to update card request");
      toastError("Failed to update card request");
    }
  };

  const handleDelete = (id: string) => {
    alert("Delete user not implemented.");
  };

  const handleAdminWalletCredit = async () => {
    if (!walletForm.asset || !walletForm.amount) return;
    try {
      const res = await fetch("/api/admin/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset: walletForm.asset, amount: walletForm.amount, address: walletForm.address || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      setRefresh(r => r + 1);
      setWalletForm({ asset: "ETH", amount: "", address: "" });
      toastSuccess("Admin wallet updated");
    } catch { toastError("Failed to update admin wallet"); }
  };

  const handleAdminWalletDebit = async (asset: string, amount: string) => {
    try {
      const res = await fetch("/api/admin/wallet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, amount, description: "Admin payout" }),
      });
      if (!res.ok) throw new Error("Failed");
      setRefresh(r => r + 1);
      toastSuccess("Funds debited from admin wallet");
    } catch { toastError("Failed to debit admin wallet"); }
  };

  const handleSubAction = async (id: string, action: string, tier?: string) => {
    try {
      const res = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: id, action, tier }),
      });
      if (!res.ok) throw new Error("Failed");
      setRefresh(r => r + 1);
      toastSuccess(`Subscription ${action.toLowerCase()}d`);
    } catch { toastError("Failed to update subscription"); }
  };

  const handleBookingAction = async (id: string, action: string) => {
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: id, action }),
      });
      if (!res.ok) throw new Error("Failed");
      setRefresh(r => r + 1);
      toastSuccess(`Booking ${action.toLowerCase()}d`);
    } catch { toastError("Failed to update booking"); }
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
        {[
          { label: "Total Users",      value: stats?.totalUsers ?? users.length,  icon: <Users className="w-5 h-5"/>, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100", sub: `${stats?.approvedUsers ?? 0} approved` },
          { label: "Pending Approval", value: stats?.pendingApproval ?? 0,        icon: <Clock className="w-5 h-5"/>, color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-100", sub: "Requires your action" },
          { label: "Pending Withdrawals", value: stats?.pendingWithdrawals ?? 0,  icon: <ArrowDownToLine className="w-5 h-5"/>, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100", sub: "Awaiting review" },
          { label: "Card Requests",    value: stats?.totalCardRequests ?? 0,      icon: <CreditCard className="w-5 h-5"/>, color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-100", sub: "Total requests" },
          { label: "Admin Wallets",    value: adminWallets.length,                icon: <Wallet className="w-5 h-5"/>, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100", sub: "Treasury assets" },
        ].map((s, i) => (
          <Card key={i} className={`shadow-sm border ${s.border} bg-white transition-all hover:shadow-md`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wider">{s.label}</CardTitle>
              <div className={`p-2 rounded-lg ${s.bg} ${s.color}`}>
                {s.icon}
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold text-gray-900`}>{s.value}</div>
              <p className="text-sm text-gray-500 mt-1 font-medium">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-0 overflow-x-auto">
        {[
          { key: "users", label: "Users" },
          { key: "withdrawals", label: "Withdrawals" },
          { key: "cards", label: "Cards" },
          { key: "wallet", label: "Wallet" },
          { key: "subscriptions", label: "Subscriptions" },
          { key: "bookings", label: "Bookings" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-semibold rounded-t-xl transition-all ${
              activeTab === tab.key
                ? "bg-white text-teal-700 border-t border-l border-r border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative top-[1px]"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-center gap-2">
          <XCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* User Management */}
      {activeTab === "users" && (
        <Card className="shadow-sm border-gray-200 bg-white rounded-xl overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50 border-b border-gray-100 pb-4">
            <CardTitle className="text-gray-900 text-lg">User Management</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search users by email or wallet..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-sm" />
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/80">
                  <th className="px-6 py-4 font-semibold">Wallet</th>
                  <th className="px-6 py-4 font-semibold">Email</th>
                  <th className="px-6 py-4 font-semibold">Joined</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-500 font-medium">Loading users...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-500 font-medium">No users found matching your search.</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 font-mono text-gray-600 text-xs">{u.address}</td>
                    <td className="px-6 py-4 text-gray-900 font-medium">{u.email || "—"}</td>
                    <td className="px-6 py-4 text-gray-500">{u.joined}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        u.status === "APPROVED" ? "bg-green-100 text-green-800" :
                        u.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                        u.status === "SUSPENDED" ? "bg-orange-100 text-orange-800" :
                        "bg-red-100 text-red-800"
                      }`}>{u.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity">
                        {u.status === "PENDING" && (
                          <>
                            <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white shadow-sm rounded-lg" onClick={() => handleStatusChange(u.id, "APPROVE")}> 
                              <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 rounded-lg" onClick={() => handleStatusChange(u.id, "REJECT")}> 
                              <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                            </Button>
                          </>
                        )}
                        {u.status === "APPROVED" && (
                          <Button size="sm" variant="outline" className="h-8 text-xs text-orange-600 border-orange-200 hover:bg-orange-50 rounded-lg" onClick={() => handleStatusChange(u.id, "SUSPEND")}> 
                            <Ban className="w-3.5 h-3.5 mr-1.5" /> Suspend
                          </Button>
                        )}
                        {u.status === "SUSPENDED" && (
                          <Button size="sm" variant="outline" className="h-8 text-xs text-green-600 border-green-200 hover:bg-green-50 rounded-lg" onClick={() => handleStatusChange(u.id, "UNSUSPEND")}> 
                            <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Restore
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={() => handleDelete(u.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Withdrawals */}
      {activeTab === "withdrawals" && (
        <Card className="shadow-sm border-gray-200 bg-white rounded-xl overflow-hidden">
          <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
            <CardTitle className="text-gray-900 text-lg">Withdrawal Requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/80">
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Amount</th>
                  <th className="px-6 py-4 font-semibold">Asset</th>
                  <th className="px-6 py-4 font-semibold">To Address</th>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {wdLoading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-500 font-medium">Loading withdrawals...</td></tr>
                ) : withdrawals.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-500 font-medium">No withdrawal requests found.</td></tr>
                ) : withdrawals.map(w => (
                  <tr key={w.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 font-mono text-gray-600 text-xs">{w.user?.address?.slice(0, 10)}...</td>
                    <td className="px-6 py-4 text-gray-900 font-bold font-mono">{w.amount}</td>
                    <td className="px-6 py-4 text-gray-900 font-medium">{w.asset}</td>
                    <td className="px-6 py-4 font-mono text-gray-600 text-xs">{w.toAddress?.slice(0, 14)}...</td>
                    <td className="px-6 py-4 text-gray-500">{new Date(w.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        w.status === "COMPLETED" || w.status === "APPROVED" ? "bg-green-100 text-green-800" :
                        w.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      }`}>{w.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {w.status === "PENDING" && (
                        <div className="flex justify-end gap-2 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white shadow-sm rounded-lg" onClick={() => handleWithdrawalAction(w.id, "APPROVE")}> 
                            <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 rounded-lg" onClick={() => handleWithdrawalAction(w.id, "REJECT")}> 
                            <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Card Requests */}
      {activeTab === "cards" && (
        <Card className="shadow-sm border-gray-200 bg-white rounded-xl overflow-hidden">
          <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
            <CardTitle className="text-gray-900 text-lg">Virtual Card Requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/80">
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Design</th>
                  <th className="px-6 py-4 font-semibold">Last 4</th>
                  <th className="px-6 py-4 font-semibold">Date</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cardLoading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-500 font-medium">Loading card requests...</td></tr>
                ) : cards.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-500 font-medium">No card requests found.</td></tr>
                ) : cards.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 font-mono text-gray-600 text-xs">{c.user?.address?.slice(0, 10)}...</td>
                    <td className="px-6 py-4 text-gray-900 font-medium capitalize">{c.design}</td>
                    <td className="px-6 py-4 text-gray-900 font-mono">{c.last4 ? `****${c.last4}` : "—"}</td>
                    <td className="px-6 py-4 text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        c.status === "APPROVED" ? "bg-green-100 text-green-800" :
                        c.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      }`}>{c.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {c.status === "PENDING" && (
                        <div className="flex justify-end gap-2 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white shadow-sm rounded-lg" onClick={() => handleCardAction(c.id, "APPROVE")}> 
                            <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 rounded-lg" onClick={() => handleCardAction(c.id, "REJECT")}> 
                            <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Admin Wallet / Treasury */}
      {activeTab === "wallet" && (
        <div className="space-y-6">
          {/* Wallet Balances */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {adminWallets.length === 0 ? (
              <Card className="col-span-full p-8 text-center text-gray-500">No admin wallets configured yet. Use the form below to initialize one.</Card>
            ) : adminWallets.map((w: any) => (
              <Card key={w.id} className="shadow-sm border-purple-100 bg-gradient-to-br from-white to-purple-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-purple-600" />
                    {w.asset}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-900">{w.balance}</p>
                  <p className="text-xs text-gray-500 mt-1">{w.label}</p>
                  {w.address && <p className="text-xs font-mono text-gray-400 mt-1 truncate">{w.address}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Credit Admin Wallet Form */}
          <Card className="shadow-sm border-gray-200 bg-white rounded-xl">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
              <CardTitle className="text-gray-900 text-lg flex items-center gap-2"><Plus className="w-5 h-5" /> Fund Treasury Wallet</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid sm:grid-cols-4 gap-4">
                <select className="p-3 border rounded-xl bg-gray-50/50" value={walletForm.asset} onChange={(e) => setWalletForm({ ...walletForm, asset: e.target.value })}>
                  <option value="ETH">ETH</option><option value="BTC">BTC</option><option value="USDC">USDC</option><option value="USDT">USDT</option><option value="BNB">BNB</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
                <input type="text" placeholder="Amount (wei/units)" className="p-3 border rounded-xl bg-gray-50/50" value={walletForm.amount} onChange={(e) => setWalletForm({ ...walletForm, amount: e.target.value })} />
                <input type="text" placeholder="On-chain address (optional)" className="p-3 border rounded-xl bg-gray-50/50" value={walletForm.address} onChange={(e) => setWalletForm({ ...walletForm, address: e.target.value })} />
                <Button className="h-12 bg-purple-600 hover:bg-purple-700 rounded-xl" onClick={handleAdminWalletCredit} disabled={!walletForm.amount}>
                  Credit Wallet
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Admin Transactions */}
          <Card className="shadow-sm border-gray-200 bg-white rounded-xl overflow-hidden">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
              <CardTitle className="text-gray-900 text-lg">Treasury Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/80">
                    <th className="px-6 py-4 font-semibold">Type</th>
                    <th className="px-6 py-4 font-semibold">Asset</th>
                    <th className="px-6 py-4 font-semibold">Amount</th>
                    <th className="px-6 py-4 font-semibold">Description</th>
                    <th className="px-6 py-4 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {walletLoading ? (
                    <tr><td colSpan={5} className="text-center py-10 text-gray-500">Loading...</td></tr>
                  ) : adminTxs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-gray-500">No treasury transactions.</td></tr>
                  ) : adminTxs.map((tx: any) => (
                    <tr key={tx.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                          tx.type === "CREDIT" || tx.type === "FEE_COLLECTED" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}>{tx.type}</span>
                      </td>
                      <td className="px-6 py-4 font-medium">{tx.asset}</td>
                      <td className="px-6 py-4 font-mono font-bold">{tx.amount}</td>
                      <td className="px-6 py-4 text-gray-600">{tx.description || "—"}</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(tx.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subscriptions Management */}
      {activeTab === "subscriptions" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          {subSummary && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <Card className="p-4 shadow-sm border-blue-100 bg-gradient-to-br from-white to-blue-50/30">
                <p className="text-xs font-semibold text-gray-600 uppercase">Total</p>
                <p className="text-2xl font-bold">{subSummary.total}</p>
              </Card>
              <Card className="p-4 shadow-sm border-green-100 bg-gradient-to-br from-white to-green-50/30">
                <p className="text-xs font-semibold text-gray-600 uppercase">Active</p>
                <p className="text-2xl font-bold text-green-700">{subSummary.active}</p>
              </Card>
              {Object.entries(subSummary.byTier || {}).map(([tier, count]: any) => (
                <Card key={tier} className="p-4 shadow-sm">
                  <p className="text-xs font-semibold text-gray-600 uppercase">{tier}</p>
                  <p className="text-2xl font-bold">{count}</p>
                </Card>
              ))}
            </div>
          )}

          <Card className="shadow-sm border-gray-200 bg-white rounded-xl overflow-hidden">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
              <CardTitle className="text-gray-900 text-lg">All Subscriptions</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/80">
                    <th className="px-6 py-4 font-semibold">User</th>
                    <th className="px-6 py-4 font-semibold">Tier</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Price</th>
                    <th className="px-6 py-4 font-semibold">Next Billing</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subLoading ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-500">Loading...</td></tr>
                  ) : adminSubs.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-500">No subscriptions.</td></tr>
                  ) : adminSubs.map((s: any) => (
                    <tr key={s.id} className="hover:bg-gray-50/50 group">
                      <td className="px-6 py-4">
                        <p className="font-medium text-sm">{s.user?.email || s.user?.name || "—"}</p>
                        <p className="font-mono text-xs text-gray-500">{s.user?.address?.slice(0, 10)}...</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 bg-purple-100 text-purple-800 text-[10px] font-bold uppercase rounded-full">{s.tier}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                          s.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                          s.status === "PAUSED" ? "bg-yellow-100 text-yellow-800" :
                          "bg-red-100 text-red-800"
                        }`}>{s.status}</span>
                      </td>
                      <td className="px-6 py-4 font-mono">{s.priceAmount} {s.asset}</td>
                      <td className="px-6 py-4 text-gray-500">{s.nextBillingDate ? new Date(s.nextBillingDate).toLocaleDateString() : "—"}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity">
                          {s.status === "ACTIVE" && (
                            <>
                              <Button size="sm" variant="outline" className="h-8 text-xs text-orange-600 border-orange-200 hover:bg-orange-50 rounded-lg" onClick={() => handleSubAction(s.id, "PAUSE")}>Pause</Button>
                              <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 rounded-lg" onClick={() => handleSubAction(s.id, "CANCEL")}>Cancel</Button>
                            </>
                          )}
                          {s.status === "PAUSED" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs text-green-600 border-green-200 hover:bg-green-50 rounded-lg" onClick={() => handleSubAction(s.id, "RESUME")}>Resume</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bookings Management */}
      {activeTab === "bookings" && (
        <div className="space-y-6">
          {/* Summary */}
          {bookingSummary && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
              {[
                { label: "Total", value: bookingSummary.total, color: "blue" },
                { label: "Pending", value: bookingSummary.pending, color: "yellow" },
                { label: "Confirmed", value: bookingSummary.confirmed, color: "green" },
                { label: "Completed", value: bookingSummary.completed, color: "teal" },
                { label: "Cancelled", value: bookingSummary.cancelled, color: "red" },
              ].map((s) => (
                <Card key={s.label} className={`p-4 shadow-sm border-${s.color}-100 bg-gradient-to-br from-white to-${s.color}-50/30`}>
                  <p className="text-xs font-semibold text-gray-600 uppercase">{s.label}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </Card>
              ))}
            </div>
          )}

          <Card className="shadow-sm border-gray-200 bg-white rounded-xl overflow-hidden">
            <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4">
              <CardTitle className="text-gray-900 text-lg">All Bookings</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/80">
                    <th className="px-6 py-4 font-semibold">User</th>
                    <th className="px-6 py-4 font-semibold">Chamber</th>
                    <th className="px-6 py-4 font-semibold">Date & Time</th>
                    <th className="px-6 py-4 font-semibold">Price</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bookingLoading ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-500">Loading...</td></tr>
                  ) : adminBookings.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-500">No bookings.</td></tr>
                  ) : adminBookings.map((b: any) => (
                    <tr key={b.id} className="hover:bg-gray-50/50 group">
                      <td className="px-6 py-4">
                        <p className="font-medium text-sm">{b.user?.email || b.user?.name || "—"}</p>
                        <p className="font-mono text-xs text-gray-500">{b.user?.address?.slice(0, 10)}...</p>
                      </td>
                      <td className="px-6 py-4 font-medium">{b.chamberName}</td>
                      <td className="px-6 py-4 text-gray-600">{b.date} at {b.timeSlot}</td>
                      <td className="px-6 py-4 font-bold">${b.priceUsd}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                          b.status === "CONFIRMED" ? "bg-green-100 text-green-800" :
                          b.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                          b.status === "COMPLETED" ? "bg-blue-100 text-blue-800" :
                          b.status === "CANCELLED" ? "bg-red-100 text-red-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>{b.status}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 flex-wrap opacity-0 group-hover:opacity-100 transition-opacity">
                          {b.status === "PENDING" && (
                            <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg" onClick={() => handleBookingAction(b.id, "CONFIRM")}>Confirm</Button>
                          )}
                          {(b.status === "PENDING" || b.status === "CONFIRMED") && (
                            <>
                              <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg" onClick={() => handleBookingAction(b.id, "COMPLETE")}>Complete</Button>
                              <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 rounded-lg" onClick={() => handleBookingAction(b.id, "CANCEL")}>Cancel</Button>
                              <Button size="sm" variant="outline" className="h-8 text-xs text-gray-600 border-gray-200 hover:bg-gray-50 rounded-lg" onClick={() => handleBookingAction(b.id, "NO_SHOW")}>No Show</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
