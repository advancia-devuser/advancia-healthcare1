"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QRCodeCanvas } from "qrcode.react";
import { QrCode, X, Copy, Loader2, Check, Clock, Ban, Plus } from "lucide-react";

interface PaymentQrModalProps {
  onClose: () => void;
  toast: any;
}

interface PaymentRequestRecord {
  id: string;
  requestId: string;
  amount: string | null;
  asset: string;
  note: string | null;
  status: string;
  createdAt: string;
  expiresAt: string | null;
  qrData: string;
}

function formatAmountWei(wei: string | null): string {
  if (!wei) return "Any amount";
  const eth = parseFloat(wei) / 1e18;
  return `${eth.toFixed(6)} ETH`;
}

export default function PaymentQrModal({ onClose, toast }: PaymentQrModalProps) {
  const [step, setStep] = useState<"form" | "qr">("form");
  const [form, setForm] = useState({ amount: "", asset: "ETH", note: "", expiresIn: "" });
  const [loading, setLoading] = useState(false);
  const [qrData, setQrData] = useState("");
  const [currentRequest, setCurrentRequest] = useState<PaymentRequestRecord | null>(null);
  const [requests, setRequests] = useState<PaymentRequestRecord[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    setRequestsLoading(true);
    try {
      const res = await fetch("/api/payments/request?limit=5");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch {
      /* ignore */
    } finally {
      setRequestsLoading(false);
    }
  }

  async function handleCreateRequest() {
    setLoading(true);
    try {
      const body: any = { asset: form.asset };
      if (form.amount && parseFloat(form.amount) > 0) {
        // Convert ETH to wei
        body.amount = Math.floor(parseFloat(form.amount) * 1e18).toString();
      }
      if (form.note) body.note = form.note;
      if (form.expiresIn && parseInt(form.expiresIn) > 0) {
        body.expiresIn = parseInt(form.expiresIn);
      }

      const res = await fetch("/api/payments/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setQrData(data.qrData);
      setCurrentRequest(data.paymentRequest);
      setStep("qr");
      fetchRequests();
      toast.success("Payment request created", "Share the QR code to receive payment.");
    } catch (e: any) {
      toast.error("Failed to create request", e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(requestId: string) {
    setCancellingId(requestId);
    try {
      const res = await fetch("/api/payments/request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action: "CANCEL" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Request cancelled", "The payment request has been cancelled.");
      setRequests(requests.map((r) => r.requestId === requestId ? { ...r, status: "CANCELLED" } : r));
      if (currentRequest?.requestId === requestId) {
        setCurrentRequest({ ...currentRequest, status: "CANCELLED" });
      }
    } catch (e: any) {
      toast.error("Failed to cancel", e.message);
    } finally {
      setCancellingId(null);
    }
  }

  function handleCopyQr() {
    navigator.clipboard.writeText(qrData);
    setCopied(true);
    toast.success("Copied", "QR data copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  }

  const statusColor: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-700",
    PAID: "bg-green-100 text-green-700",
    CANCELLED: "bg-gray-100 text-gray-500",
    EXPIRED: "bg-red-100 text-red-500",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b border-gray-100 pb-4">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-blue-600" />
              {step === "form" ? "Request Payment" : "Payment QR Code"}
            </span>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-5 space-y-5">
          {step === "form" && (
            <>
              {/* Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Amount <span className="font-normal text-gray-400">(optional — leave blank for any)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      className="flex-1 p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                    <select
                      className="w-24 p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold"
                      value={form.asset}
                      onChange={(e) => setForm({ ...form, asset: e.target.value })}
                    >
                      <option>ETH</option>
                      <option>USDC</option>
                      <option>USDT</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Note <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dinner, rent, invoice #42"
                    maxLength={120}
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Expires in <span className="font-normal text-gray-400">(hours, optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="720"
                    placeholder="24"
                    className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    value={form.expiresIn}
                    onChange={(e) => setForm({ ...form, expiresIn: e.target.value })}
                  />
                </div>

                <Button
                  className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/20"
                  onClick={handleCreateRequest}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" /> Generate QR Code
                    </>
                  )}
                </Button>
              </div>

              {/* Recent requests */}
              {requestsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : requests.length > 0 ? (
                <div className="space-y-3 pt-3 border-t border-gray-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Recent Requests</h3>
                  {requests.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-blue-50 hover:border-blue-100 transition-colors"
                      onClick={() => { setQrData(r.qrData); setCurrentRequest(r); setStep("qr"); }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800 truncate">
                            {r.amount ? `${(parseFloat(r.amount) / 1e18).toFixed(6)} ${r.asset}` : `Any ${r.asset}`}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[r.status] || "bg-gray-100 text-gray-500"}`}>
                            {r.status}
                          </span>
                        </div>
                        {r.note && <p className="text-xs text-gray-500 truncate mt-0.5">{r.note}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(r.createdAt).toLocaleDateString()}
                          {r.expiresAt && ` · Expires ${new Date(r.expiresAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      {r.status === "PENDING" && (
                        <button
                          className="ml-2 p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleCancel(r.requestId); }}
                          disabled={cancellingId === r.requestId}
                        >
                          {cancellingId === r.requestId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Ban className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}

          {step === "qr" && currentRequest && (
            <>
              {/* QR display */}
              <div className="flex flex-col items-center space-y-4">
                {currentRequest.status === "CANCELLED" || currentRequest.status === "EXPIRED" ? (
                  <div className="p-6 bg-gray-100 rounded-xl border border-gray-200 text-center">
                    <Ban className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 font-medium">This request has been {currentRequest.status.toLowerCase()}</p>
                  </div>
                ) : (
                  <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <QRCodeCanvas value={qrData} size={200} level="H" includeMargin />
                  </div>
                )}

                <div className="w-full space-y-2">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <div>
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Amount</p>
                      <p className="font-bold text-gray-900">
                        {currentRequest.amount
                          ? `${(parseFloat(currentRequest.amount) / 1e18).toFixed(6)} ${currentRequest.asset}`
                          : `Any ${currentRequest.asset}`}
                      </p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full font-semibold ${statusColor[currentRequest.status] || "bg-gray-100 text-gray-500"}`}>
                      {currentRequest.status}
                    </span>
                  </div>

                  {currentRequest.note && (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-0.5">Note</p>
                      <p className="text-sm text-gray-800">{currentRequest.note}</p>
                    </div>
                  )}

                  {currentRequest.expiresAt && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-700">
                      <Clock className="w-4 h-4 shrink-0" />
                      <p className="text-xs font-medium">
                        Expires {new Date(currentRequest.expiresAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex w-full gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={handleCopyQr}
                    disabled={currentRequest.status !== "PENDING"}
                  >
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied!" : "Copy QR Data"}
                  </Button>

                  {currentRequest.status === "PENDING" && (
                    <Button
                      variant="outline"
                      className="gap-2 text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => handleCancel(currentRequest.requestId)}
                      disabled={cancellingId === currentRequest.requestId}
                    >
                      {cancellingId === currentRequest.requestId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Ban className="w-4 h-4" />
                      )}
                      Cancel
                    </Button>
                  )}
                </div>

                <Button
                  variant="ghost"
                  className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => setStep("form")}
                >
                  ← Create Another Request
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
