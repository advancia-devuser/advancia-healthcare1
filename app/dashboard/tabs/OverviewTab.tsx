import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Send, ArrowDownToLine, ShoppingCart, QrCode, Activity, Clock, CreditCard, Heart } from "lucide-react";

export default function OverviewTab({
  balance,
  transactions,
  cards,
  healthCards,
  setShowSendModal,
  setShowReceiveModal,
  setShowBuyModal,
  setBuyStep,
  setBuyForm,
  setBuyWidgetUrl,
}: any) {
  const approvedCard = cards.find((c: any) => c.status === "APPROVED" && c.last4);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-white to-blue-50/50 border-blue-100 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-blue-800 uppercase tracking-wider">Account Balance (ETH)</CardTitle>
            <div className="p-2 bg-blue-100 rounded-full">
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-extrabold text-gray-900 tracking-tight">{balance}</div>
            <p className="text-xs text-blue-600/80 mt-1 mb-6 font-medium">Available for transfers and payments</p>
            <div className="grid grid-cols-4 gap-2">
              <Button variant="default" size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700 shadow-sm" onClick={() => setShowSendModal(true)}>
                <Send className="w-3.5 h-3.5" /> Send
              </Button>
              <Button variant="outline" size="sm" className="gap-1 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setShowReceiveModal(true)}>
                <ArrowDownToLine className="w-3.5 h-3.5" /> Receive
              </Button>
              <Button variant="outline" size="sm" className="gap-1 border-green-200 text-green-700 hover:bg-green-50" onClick={() => { setShowBuyModal(true); setBuyStep("select"); setBuyForm({ provider: "", fiatAmount: "", fiatCurrency: "USD", cryptoAsset: "ETH" }); setBuyWidgetUrl(""); }}>
                <ShoppingCart className="w-3.5 h-3.5" /> Buy
              </Button>
              <Button variant="outline" size="sm" className="gap-1 border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setShowReceiveModal(true)}>
                <QrCode className="w-3.5 h-3.5" /> QR
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Active Card Summary */}
        <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-indigo-100">Active Card</CardTitle>
            <CreditCard className="w-4 h-4 text-indigo-200" />
          </CardHeader>
          <CardContent>
            {approvedCard ? (
              <>
                <div className="text-2xl font-bold tracking-widest mb-1">•••• {approvedCard.last4}</div>
                <p className="text-sm text-indigo-200 mb-4">{approvedCard.cardType} • {approvedCard.currency}</p>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-xs text-indigo-300 uppercase tracking-wider">Limit</p>
                    <p className="font-semibold">${approvedCard.spendingLimit || "Unlimited"}</p>
                  </div>
                  <div className="w-10 h-6 bg-white/20 rounded-md flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-red-500/80 -mr-1"></div>
                    <div className="w-4 h-4 rounded-full bg-yellow-500/80"></div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-4 text-center">
                <p className="text-indigo-100 mb-3 text-sm">No active cards</p>
                <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0">
                  Order a Card
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Health Summary */}
        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-emerald-800 uppercase tracking-wider">Health Profile</CardTitle>
            <div className="p-2 bg-emerald-100 rounded-full">
              <Heart className="w-4 h-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-white rounded-xl border border-emerald-100 shadow-sm">
                <span className="text-sm font-medium text-gray-600">Saved Cards</span>
                <span className="text-lg font-bold text-emerald-700">{healthCards.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-xl border border-emerald-100 shadow-sm">
                <span className="text-sm font-medium text-gray-600">Upcoming Reminders</span>
                <span className="text-lg font-bold text-emerald-700">0</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50">
          <CardTitle className="flex items-center gap-2 text-lg text-gray-800">
            <Activity className="w-5 h-5 text-blue-600" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
              <Clock className="w-12 h-12 text-gray-300 mb-3" />
              <p>No recent transactions</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {transactions.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === "RECEIVE" ? "bg-green-100 text-green-600" :
                      tx.type === "SEND" ? "bg-blue-100 text-blue-600" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {tx.type === "RECEIVE" ? <ArrowDownToLine className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{tx.type}</p>
                      <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${tx.type === "RECEIVE" ? "text-green-600" : "text-gray-900"}`}>
                      {tx.type === "RECEIVE" ? "+" : "-"}{tx.amount} {tx.asset}
                    </p>
                    <p className="text-xs text-muted-foreground">{tx.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
