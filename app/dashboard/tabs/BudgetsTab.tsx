import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, PiggyBank, AlertTriangle, Loader2 } from "lucide-react";

export default function BudgetsTab({
  budgetSummary,
  budgetForm,
  setBudgetForm,
  budgets,
  handleCreateBudget,
  actionLoading,
  formatBalance,
}: any) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      {budgetSummary && budgetSummary.totalBudgets > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total Budgets</p>
            <p className="text-2xl font-bold">{budgetSummary.totalBudgets}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total Limit</p>
            <p className="text-2xl font-bold">{formatBalance(budgetSummary.totalLimit)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Total Spent</p>
            <p className="text-2xl font-bold">{formatBalance(budgetSummary.totalSpent)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Usage</p>
            <p className="text-2xl font-bold">{budgetSummary.overallPercentUsed}%</p>
          </Card>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Create Budget */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="w-5 h-5" /> New Budget</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <input type="text" placeholder="e.g., Monthly Food" className="w-full p-2 border rounded-md bg-background"
                value={budgetForm.name} onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <select className="w-full p-2 border rounded-md bg-background"
                value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}>
                <option>General</option><option>Food</option><option>Transport</option>
                <option>Entertainment</option><option>Bills</option><option>Shopping</option>
                <option>Savings</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Limit (wei)</label>
              <input type="text" placeholder="0" className="w-full p-2 border rounded-md bg-background"
                value={budgetForm.limitAmount} onChange={(e) => setBudgetForm({ ...budgetForm, limitAmount: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleCreateBudget} disabled={actionLoading || !budgetForm.name || !budgetForm.limitAmount}>
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Budget"}
            </Button>
          </CardContent>
        </Card>

        {/* Budget List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PiggyBank className="w-5 h-5" /> My Budgets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {budgets.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No budgets created yet</p>
              ) : budgets.map((b: any) => (
                <div key={b.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <h3 className="font-semibold text-sm">{b.name}</h3>
                      <p className="text-xs text-muted-foreground">{b.category}</p>
                    </div>
                    {b.isOverBudget && <AlertTriangle className="w-4 h-4 text-red-500" />}
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 mb-2">
                    <div className={`h-2 rounded-full ${b.percentUsed > 80 ? "bg-red-500" : b.percentUsed > 50 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${Math.min(100, b.percentUsed)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Spent: {formatBalance(b.spentAmount)}</span>
                    <span>Limit: {formatBalance(b.limitAmount)}</span>
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
