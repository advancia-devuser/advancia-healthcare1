import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, History, ArrowDownToLine, Loader2 } from "lucide-react";

export default function TransfersTab({
  sendForm,
  setSendForm,
  contacts,
  transactions,
  handleSend,
  actionLoading,
  formatBalance,
}: any) {
  return (
    <div className="grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
            Transfer History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {transactions.filter((t: any) => t.type === "SEND" || t.type === "RECEIVE").length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <History className="w-10 h-10 mb-3 opacity-20" />
                <p>No transfers yet</p>
              </div>
            ) : transactions.filter((t: any) => t.type === "SEND" || t.type === "RECEIVE").slice(0, 10).map((tx: any) => (
              <div key={tx.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
                    tx.type === "RECEIVE" ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                  }`}>
                    {tx.type === "RECEIVE" ? <ArrowDownToLine className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{tx.type}</p>
                    <p className="text-xs text-gray-500 font-medium">{tx.asset}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-sm ${tx.type === "RECEIVE" ? "text-green-600" : "text-gray-900"}`}>
                    {tx.type === "RECEIVE" ? "+" : "-"}{formatBalance(tx.amount)} {tx.asset}
                  </p>
                  <p className="text-xs text-gray-400 font-medium">{new Date(tx.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
