import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt, History, Loader2 } from "lucide-react";

export default function BillsTab({
  billForm,
  setBillForm,
  bills,
  handlePayBill,
  actionLoading,
  formatBalance,
}: any) {
  return (
    <div className="grid md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Pay Bill */}
      <Card className="shadow-sm border-gray-200/60">
        <CardHeader className="border-b border-gray-100 pb-4 mb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <div className="p-1.5 bg-teal-100 rounded-md">
              <Receipt className="w-4 h-4 text-teal-600" />
            </div>
            Pay Medical Bill
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Biller Name</label>
            <input type="text" placeholder="e.g., City Hospital" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
              value={billForm.billerName} onChange={(e) => setBillForm({ ...billForm, billerName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Account / Invoice Number</label>
            <input type="text" placeholder="Invoice #" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
              value={billForm.accountNumber} onChange={(e) => setBillForm({ ...billForm, accountNumber: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Amount (wei)</label>
            <input type="text" placeholder="0" className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
              value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} />
          </div>
          <Button className="w-full h-12 text-base font-semibold bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-600/20 rounded-xl mt-2" onClick={handlePayBill} disabled={actionLoading || !billForm.billerName || !billForm.amount}>
            {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Pay Bill"}
          </Button>
        </CardContent>
      </Card>

      {/* Bill History */}
      <Card className="shadow-sm border-gray-200/60">
        <CardHeader className="border-b border-gray-100 pb-4 mb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-800">
            <div className="p-1.5 bg-gray-100 rounded-md">
              <History className="w-4 h-4 text-gray-600" />
            </div>
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {bills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Receipt className="w-10 h-10 mb-3 opacity-20" />
                <p>No bills paid yet</p>
              </div>
            ) : bills.map((b: any) => (
              <div key={b.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                <div>
                  <p className="font-semibold text-sm text-gray-900">{b.billerName}</p>
                  <p className="text-xs text-gray-500 font-medium">Acc: {b.accountNumber}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm text-gray-900">{formatBalance(b.amount)} {b.asset}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mt-1 inline-block ${
                    b.status === "PAID" ? "bg-green-100 text-green-800" :
                    b.status === "SCHEDULED" ? "bg-blue-100 text-blue-800" :
                    "bg-yellow-100 text-yellow-800"
                  }`}>{b.status}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
