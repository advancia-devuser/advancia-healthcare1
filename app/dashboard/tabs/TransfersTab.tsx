import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, History, ArrowDownToLine, Loader2, QrCode, CheckCircle, AlertCircle, Ban, Clock, Zap, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useUser } from "@account-kit/react";
import { shortenAddress } from "@/lib/utils";
import Link from "next/link";

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  PAID: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  EXPIRED: "bg-red-100 text-red-500",
};

export default function TransfersTab({
  sendForm,
  setSendForm,
  contacts,
  handleSend,
  actionLoading,
  paymentRequests,
  setPaymentRequests,
  handleQrConfirmPay,
  toast,
  profile,
  formatBalance,
}: any) {
  const { user } = useUser();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrInput, setQrInput] = useState("");
  const [qrParsing, setQrParsing] = useState(false);
  const [qrParsed, setQrParsed] = useState<any>(null);
  const [qrError, setQrError] = useState("");
  const [qrConfirming, setQrConfirming] = useState(false);
  const [qrPin, setQrPin] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTransactions() {
      try {
        setLoading(true);
        const res = await fetch("/api/transactions");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setTransactions(data);
      } catch (e: any) {
        toast.error("Failed to fetch transactions", e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchTransactions();
  }, [toast]);

  async function handleParseQr() {
    if (!qrInput.trim()) return;
    setQrParsing(true);
    setQrError("");
    setQrParsed(null);
    try {
      const res = await fetch("/api/payments/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrData: qrInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQrParsed(data);
      setQrPin("");
      // Only pre-fill send form if there's no fixed amount (open-ended QR)
      if (!data.amount) {
        setSendForm((prev: any) => ({
          ...prev,
          recipient: data.recipient || "",
          asset: data.asset || "ETH",
        }));
      }
    } catch (e: any) {
      setQrError(e.message || "Invalid QR data");
    } finally {
      setQrParsing(false);
    }
  }

  async function handleConfirmQrPay() {
    setQrConfirming(true);
    setQrError("");
    try {
      const result = await handleQrConfirmPay(qrInput.trim(), qrPin || undefined);
      toast.success("Payment sent!", `${(parseFloat(result.amount) / 1e18).toFixed(6)} ${result.asset} sent successfully.`);
      setQrInput("");
      setQrParsed(null);
      setQrPin("");
    } catch (e: any) {
      setQrError(e.message || "Payment failed");
    } finally {
      setQrConfirming(false);
    }
  }

  async function handleCancelRequest(requestId: string) {
    setCancellingId(requestId);
    try {
      const res = await fetch("/api/payments/request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action: "CANCEL" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPaymentRequests((prev: any[]) =>
        prev.map((r: any) => r.requestId === requestId ? { ...r, status: "CANCELLED" } : r)
      );
      toast.success("Request cancelled", "The payment request has been cancelled.");
    } catch (e: any) {
      toast.error("Cancel failed", e.message);
    } finally {
      setCancellingId(null);
    }
  }

  const renderTransactionHistory = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    if (transactions.length === 0) {
      return <p className="text-center text-muted-foreground py-8">No transactions yet.</p>;
    }

    return (
      <ul className="space-y-3">
        {transactions.map((tx: any) => {
          const isSent = tx.from.toLowerCase() === user?.address.toLowerCase();
          const value = tx.value ? parseFloat(tx.value).toFixed(5) : "0";
          const symbol = tx.asset;
          const otherAddress = isSent ? tx.to : tx.from;

          return (
            <li key={tx.hash} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isSent ? 'bg-red-100' : 'bg-green-100'}`}>
                  {isSent ? <ArrowUpRight className="w-5 h-5 text-red-600" /> : <ArrowDownLeft className="w-5 h-5 text-green-600" />}
                </div>
                <div>
                  <p className="font-semibold">{isSent ? "Sent" : "Received"} {symbol}</p>
                  <p className="text-xs text-muted-foreground">
                    {isSent ? "To" : "From"}: {shortenAddress(otherAddress)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold ${isSent ? 'text-red-600' : 'text-green-600'}`}>
                  {isSent ? "-" : "+"}
                  {value} {symbol}
                </p>
                <Link href={`https://sepolia.arbiscan.io/tx/${tx.hash}`} target="_blank" className="text-xs text-blue-500 hover:underline">
                  View on Arbiscan
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };


  function handleClearQr() {
    setQrInput("");
    setQrParsed(null);
    setQrError("");
    setQrPin("");
  }
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* QR Scan Section */}
      <Card className="shadow-sm border-purple-100 bg-purple-50/30">
        <CardHeader className="border-b border-purple-100 pb-4 mb-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-purple-800">
            <div className="p-1.5 bg-purple-100 rounded-md">
              <QrCode className="w-4 h-4 text-purple-600" />
            </div>
            Scan / Paste QR Payment Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex gap-3">
            <textarea
              rows={2}
              placeholder='Paste QR code data here (e.g. {"type":"smartwallet-pay", ...})'
              className="flex-1 p-3 border border-purple-200 rounded-xl bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-sm font-mono resize-none"
              value={qrInput}
              onChange={(e) => { setQrInput(e.target.value); setQrError(""); setQrParsed(null); }}
            />
            <div className="flex flex-col gap-2">
              <Button
                className="bg-purple-600 hover:bg-purple-700 text-white px-5 rounded-xl gap-2 h-10"
                onClick={handleParseQr}
                disabled={qrParsing || !qrInput.trim()}
              >
                {qrParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                Parse
              </Button>
              {(qrParsed || qrError) && (
                <Button variant="outline" size="sm" className="rounded-xl border-gray-200" onClick={handleClearQr}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {qrError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{qrError}</span>
            </div>
          )}

          {qrParsed && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <CheckCircle className="w-4 h-4" />
                QR parsed
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Recipient</span>
                  <span className="font-mono text-gray-800 break-all text-xs">{qrParsed.recipient}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Amount</span>
                  <span className="font-semibold text-gray-800">
                    {qrParsed.amount
                      ? `${(parseFloat(qrParsed.amount) / 1e18).toFixed(6)} ${qrParsed.asset}`
                      : `Any ${qrParsed.asset}`}
                  </span>
                </div>
                {qrParsed.note && (
                  <div className="col-span-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Note</span>
                    <span className="text-gray-800">{qrParsed.note}</span>
                  </div>
                )}
              </div>

              {/* Confirm & Pay (fixed-amount QR) */}
              {qrParsed.amount ? (
                <div className="space-y-3 pt-2 border-t border-green-200">
                  {profile?.hasPin && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">Transaction PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit PIN"
                        className="w-full p-2.5 border border-gray-200 rounded-xl text-sm tracking-widest bg-white focus:ring-2 focus:ring-purple-500/20"
                        value={qrPin}
                        onChange={(e) => setQrPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                    </div>
                  )}
                  <Button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl gap-2 h-11 font-semibold shadow-md shadow-purple-600/20"
                    onClick={handleConfirmQrPay}
                    disabled={qrConfirming || (profile?.hasPin && qrPin.length < 6)}
                  >
                    {qrConfirming
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <><Zap className="w-4 h-4" /> Confirm & Pay {(parseFloat(qrParsed.amount) / 1e18).toFixed(6)} {qrParsed.asset}</>}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-blue-600 font-medium">↓ Open amount — review and fill in the Send form below</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Send */}
        <Card className="shadow-sm border-gray-200/60">
          <CardHeader className="border-b border-gray-100 pb-4 mb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
              <div className="p-1.5 bg-blue-100 rounded-md">
                <Send className="w-4 h-4 text-blue-600" />
              </div>
              Send Crypto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Recipient Address</label>
              <input type="text" placeholder="0x..." className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                value={sendForm.recipient} onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })} />
            </div>
            {contacts.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quick Select Contact</label>
                <div className="flex flex-wrap gap-2">
                  {contacts.slice(0, 5).map((c: any) => (
                    <button key={c.id} className="px-3 py-1.5 border border-gray-200 rounded-full text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                      onClick={() => setSendForm({ ...sendForm, recipient: c.address })}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Amount (wei)</label>
                <input type="text" placeholder="0" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={sendForm.amount} onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Asset</label>
                <select className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={sendForm.asset} onChange={(e) => setSendForm({ ...sendForm, asset: e.target.value })}>
                  <option>ETH</option><option>USDC</option><option>USDT</option>
                </select>
              </div>
            </div>
            <Button className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 rounded-xl mt-2" onClick={handleSend} disabled={actionLoading || !sendForm.recipient || !sendForm.amount}>
              {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Transfer"}
            </Button>
          </CardContent>
        </Card>

        {/* Transfer History */}
        <Card className="shadow-sm border-gray-200/60">
          <CardHeader className="border-b border-gray-100 pb-4 mb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
              <div className="p-1.5 bg-gray-100 rounded-md">
                <History className="w-4 h-4 text-gray-600" />
              </div>
              Transaction History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderTransactionHistory()}
          </CardContent>
        </Card>
      </div> {/* end grid */}

      {/* Outgoing Payment Requests */}
      {paymentRequests && paymentRequests.length > 0 && (
        <Card className="shadow-sm border-gray-200/60">
          <CardHeader className="border-b border-gray-100 pb-4 mb-1">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
              <div className="p-1.5 bg-yellow-100 rounded-md">
                <Clock className="w-4 h-4 text-yellow-600" />
              </div>
              My Payment Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {paymentRequests.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-800">
                        {r.amount
                          ? `${(parseFloat(r.amount) / 1e18).toFixed(6)} ${r.asset}`
                          : `Any ${r.asset}`}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[r.status] || "bg-gray-100 text-gray-500"}`}>
                        {r.status}
                      </span>
                    </div>
                    {r.note && <p className="text-xs text-gray-500 truncate mt-0.5">{r.note}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                      {r.expiresAt && (
                        <p className="text-xs text-amber-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> expires {new Date(r.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                      {r.paidBy && (
                        <p className="text-xs text-green-600 font-medium">
                          Paid by {r.paidBy.slice(0, 6)}...{r.paidBy.slice(-4)}
                        </p>
                      )}
                    </div>
                  </div>
                  {r.status === "PENDING" && (
                    <button
                      className="ml-3 p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                      onClick={() => handleCancelRequest(r.requestId)}
                      disabled={cancellingId === r.requestId}
                      title="Cancel request"
                    >
                      {cancellingId === r.requestId
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Ban className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
