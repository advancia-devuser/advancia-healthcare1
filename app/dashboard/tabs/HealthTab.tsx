import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Activity, CalendarClock, Check, Plus, ShieldCheck, Stethoscope, Pill, Heart, Receipt, History, Bell, Loader2, Trash2 } from "lucide-react";

export default function HealthTab({
  healthCards,
  healthTransactions,
  healthReminderSummary,
  healthCardForm,
  setHealthCardForm,
  handleAddHealthCard,
  handleDeleteHealthCard,
  healthPayForm,
  setHealthPayForm,
  handleHealthPayment,
  healthReminderForm,
  setHealthReminderForm,
  handleAddReminder,
  healthReminders,
  handleCompleteReminder,
  actionLoading,
  formatBalance,
}: any) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Health Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5 shadow-sm border-blue-100 bg-gradient-to-br from-white to-blue-50/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-100 rounded-md">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Health Cards</p>
          </div>
          <p className="text-3xl font-extrabold text-gray-900">{healthCards.length}</p>
        </Card>
        <Card className="p-5 shadow-sm border-green-100 bg-gradient-to-br from-white to-green-50/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-green-100 rounded-md">
              <Activity className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Transactions</p>
          </div>
          <p className="text-3xl font-extrabold text-gray-900">{healthTransactions.length}</p>
        </Card>
        <Card className="p-5 shadow-sm border-orange-100 bg-gradient-to-br from-white to-orange-50/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-orange-100 rounded-md">
              <CalendarClock className="w-4 h-4 text-orange-600" />
            </div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Pending Reminders</p>
          </div>
          <p className="text-3xl font-extrabold text-gray-900">{healthReminderSummary?.pending ?? 0}</p>
        </Card>
        <Card className="p-5 shadow-sm border-teal-100 bg-gradient-to-br from-white to-teal-50/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-teal-100 rounded-md">
              <Check className="w-4 h-4 text-teal-600" />
            </div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Completed</p>
          </div>
          <p className="text-3xl font-extrabold text-gray-900">{healthReminderSummary?.completed ?? 0}</p>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Add Health Card */}
        <Card className="shadow-sm border-gray-200/60">
          <CardHeader className="border-b border-gray-100 pb-4 mb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
              <div className="p-1.5 bg-blue-100 rounded-md">
                <Plus className="w-4 h-4 text-blue-600" />
              </div>
              Add Health Card
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Provider Name</label>
              <input type="text" placeholder="e.g., Blue Cross" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                value={healthCardForm.providerName} onChange={(e) => setHealthCardForm({ ...healthCardForm, providerName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Card Type</label>
              <select className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                value={healthCardForm.cardType} onChange={(e) => setHealthCardForm({ ...healthCardForm, cardType: e.target.value })}>
                <option value="INSURANCE">Insurance</option>
                <option value="VACCINATION">Vaccination</option>
                <option value="PRESCRIPTION">Prescription</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Card Details (JSON)</label>
              <textarea placeholder='{"policyNumber": "...", "memberId": "..."}' className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-mono h-24 resize-none"
                value={healthCardForm.cardData} onChange={(e) => setHealthCardForm({ ...healthCardForm, cardData: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Expires At (optional)</label>
              <input type="date" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                value={healthCardForm.expiresAt} onChange={(e) => setHealthCardForm({ ...healthCardForm, expiresAt: e.target.value })} />
            </div>
            <Button className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 rounded-xl mt-2" onClick={handleAddHealthCard} disabled={actionLoading || !healthCardForm.providerName}>
              {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Add Card Securely"}
            </Button>
            <p className="text-xs text-center text-gray-500 font-medium flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-green-500" /> Data encrypted with AES-256-GCM
            </p>
          </CardContent>
        </Card>

        {/* My Health Cards */}
        <Card className="shadow-sm border-gray-200/60">
          <CardHeader className="border-b border-gray-100 pb-4 mb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
              <div className="p-1.5 bg-red-100 rounded-md">
                <Heart className="w-4 h-4 text-red-500" />
              </div>
              My Health Cards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {healthCards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <FileText className="w-10 h-10 mb-3 opacity-20" />
                  <p>No health cards stored</p>
                </div>
              ) : healthCards.map((card: any) => (
                <div key={card.id} className="p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
                        card.cardType === "INSURANCE" ? "bg-blue-100 text-blue-600" :
                        card.cardType === "VACCINATION" ? "bg-green-100 text-green-600" :
                        "bg-purple-100 text-purple-600"
                      }`}>
                        {card.cardType === "INSURANCE" ? <ShieldCheck className="w-5 h-5" /> :
                         card.cardType === "VACCINATION" ? <Stethoscope className="w-5 h-5" /> :
                         <Pill className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{card.providerName}</p>
                        <p className="text-xs text-gray-500 font-medium">{card.cardType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        card.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                        card.status === "EXPIRED" ? "bg-red-100 text-red-800" :
                        "bg-gray-100 text-gray-600"
                      }`}>{card.status}</span>
                      <button onClick={() => handleDeleteHealthCard(card.id)} className="p-1.5 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                  {card.expiresAt && (
                    <p className="text-xs text-gray-400 font-medium mt-2">Expires: {new Date(card.expiresAt).toLocaleDateString()}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Health Payment */}
        <Card className="shadow-sm border-gray-200/60">
          <CardHeader className="border-b border-gray-100 pb-4 mb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
              <div className="p-1.5 bg-teal-100 rounded-md">
                <Receipt className="w-4 h-4 text-teal-600" />
              </div>
              Health Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Linked Health Card (optional)</label>
              <select className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                value={healthPayForm.healthCardId} onChange={(e) => setHealthPayForm({ ...healthPayForm, healthCardId: e.target.value })}>
                <option value="">None</option>
                {healthCards.filter((c: any) => c.status === "ACTIVE").map((c: any) => (
                  <option key={c.id} value={c.id}>{c.providerName} ({c.cardType})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Description</label>
              <input type="text" placeholder="e.g., Doctor visit, Prescription" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                value={healthPayForm.description} onChange={(e) => setHealthPayForm({ ...healthPayForm, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Amount (wei)</label>
              <input type="text" placeholder="0" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                value={healthPayForm.amount} onChange={(e) => setHealthPayForm({ ...healthPayForm, amount: e.target.value })} />
            </div>
            <Button className="w-full h-12 text-base font-semibold bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-600/20 rounded-xl mt-2" onClick={handleHealthPayment} disabled={actionLoading || !healthPayForm.amount || !healthPayForm.description}>
              {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Pay via Wallet"}
            </Button>
          </CardContent>
        </Card>

        {/* Health Transaction History */}
        <Card className="shadow-sm border-gray-200/60">
          <CardHeader className="border-b border-gray-100 pb-4 mb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
              <div className="p-1.5 bg-gray-100 rounded-md">
                <History className="w-4 h-4 text-gray-600" />
              </div>
              Health Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {healthTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Receipt className="w-10 h-10 mb-3 opacity-20" />
                  <p>No health payments yet</p>
                </div>
              ) : healthTransactions.slice(0, 8).map((tx: any) => (
                <div key={tx.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{tx.description || "Health payment"}</p>
                    <p className="text-xs text-gray-500 font-medium">
                      {tx.healthCard ? tx.healthCard.providerName : "Direct payment"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-gray-900">{formatBalance(tx.amount)} {tx.asset}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mt-1 inline-block ${
                      tx.status === "COMPLETED" ? "bg-green-100 text-green-800" :
                      tx.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                    }`}>{tx.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Health Reminders */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Add Reminder */}
        <Card className="shadow-sm border-gray-200/60">
          <CardHeader className="border-b border-gray-100 pb-4 mb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
              <div className="p-1.5 bg-orange-100 rounded-md">
                <CalendarClock className="w-4 h-4 text-orange-600" />
              </div>
              Set Reminder
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Type</label>
              <select className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                value={healthReminderForm.type} onChange={(e) => setHealthReminderForm({ ...healthReminderForm, type: e.target.value })}>
                <option value="Appointment">Appointment</option>
                <option value="Medication">Medication</option>
                <option value="PremiumDue">Premium Due</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Message</label>
              <input type="text" placeholder="e.g., Dentist at 3 PM" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                value={healthReminderForm.message} onChange={(e) => setHealthReminderForm({ ...healthReminderForm, message: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Remind At</label>
              <input type="datetime-local" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                value={healthReminderForm.remindAt} onChange={(e) => setHealthReminderForm({ ...healthReminderForm, remindAt: e.target.value })} />
            </div>
            <Button className="w-full h-12 text-base font-semibold bg-orange-500 hover:bg-orange-600 shadow-md shadow-orange-500/20 rounded-xl mt-2" onClick={handleAddReminder} disabled={actionLoading || !healthReminderForm.message || !healthReminderForm.remindAt}>
              {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Set Reminder"}
            </Button>
          </CardContent>
        </Card>

        {/* Reminder List */}
        <Card className="shadow-sm border-gray-200/60">
          <CardHeader className="border-b border-gray-100 pb-4 mb-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
              <div className="p-1.5 bg-blue-100 rounded-md">
                <Bell className="w-4 h-4 text-blue-600" />
              </div>
              My Reminders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {healthReminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <CalendarClock className="w-10 h-10 mb-3 opacity-20" />
                  <p>No reminders set</p>
                </div>
              ) : healthReminders.map((r: any) => (
                <div key={r.id} className={`p-4 border rounded-xl transition-colors ${
                  r.status === "PENDING" ? "border-orange-200 bg-orange-50/50 hover:bg-orange-50" :
                  r.status === "SENT" ? "border-blue-200 bg-blue-50/50 hover:bg-blue-50" :
                  "border-green-200 bg-green-50/50 hover:bg-green-50"
                }`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
                        r.type === "Appointment" ? "bg-blue-100 text-blue-600" :
                        r.type === "Medication" ? "bg-purple-100 text-purple-600" :
                        "bg-orange-100 text-orange-600"
                      }`}>
                        {r.type === "Appointment" ? <Stethoscope className="w-5 h-5" /> :
                         r.type === "Medication" ? <Pill className="w-5 h-5" /> :
                         <Receipt className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{r.message}</p>
                        <p className="text-xs text-gray-500 font-medium">{r.type} — {new Date(r.remindAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        r.status === "PENDING" ? "bg-orange-100 text-orange-800" :
                        r.status === "SENT" ? "bg-blue-100 text-blue-800" :
                        "bg-green-100 text-green-800"
                      }`}>{r.status}</span>
                      {r.status !== "COMPLETED" && (
                        <button onClick={() => handleCompleteReminder(r.id)} className="p-1.5 hover:bg-green-100 rounded-md transition-colors" title="Mark complete">
                          <Check className="w-4 h-4 text-green-600" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
