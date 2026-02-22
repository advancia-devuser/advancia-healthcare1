import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, CreditCard, Star, Gift } from "lucide-react";

export default function CardsTab({
  setShowOrderCardModal,
  cards,
  handleCardAction,
  loyaltyCards,
  giftCards,
}: any) {
  return (
    <div className="space-y-6">
      {/* Order Card Banner */}
      <Card className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-0">
        <CardContent className="py-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Order Your Card</h2>
            <p className="text-white/80 text-sm mt-1">Get a virtual or physical debit/credit card delivered to your door</p>
          </div>
          <Button onClick={() => setShowOrderCardModal(true)} className="bg-white text-indigo-600 hover:bg-white/90 font-semibold">
            <Plus className="w-4 h-4 mr-2" /> Order Card
          </Button>
        </CardContent>
      </Card>

      {/* My Card Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> My Cards</CardTitle>
        </CardHeader>
        <CardContent>
          {cards.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No cards ordered yet. Click &quot;Order Card&quot; above to get started!</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {cards.map((c: any) => (
                <div key={c.id} className={`p-4 border rounded-xl ${c.frozenAt ? "bg-blue-50 border-blue-200" : "bg-white"}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.cardType === "PHYSICAL" ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"}`}>
                          {c.cardType}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          c.status === "APPROVED" ? "bg-green-100 text-green-800" :
                          c.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                          c.status === "REJECTED" ? "bg-red-100 text-red-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>{c.status}</span>
                      </div>
                      <p className="font-semibold mt-2">{c.design} Card</p>
                      <p className="text-xs text-muted-foreground">{c.currency} &#183; {new Date(c.createdAt).toLocaleDateString()}</p>
                    </div>
                    {c.frozenAt && <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded">FROZEN</span>}
                  </div>
                  {c.spendingLimit && (
                    <p className="text-xs text-muted-foreground mb-2">Limit: {c.spendingLimit} {c.currency}</p>
                  )}
                  {c.cardType === "PHYSICAL" && c.deliveryCity && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Ship to: {c.deliveryCity}, {c.deliveryState} {c.deliveryZip}
                    </p>
                  )}
                  {c.trackingNumber && (
                    <p className="text-xs text-green-700 mb-2">Tracking: {c.trackingNumber}</p>
                  )}
                  <div className="flex gap-2 mt-3">
                    {c.status === "APPROVED" && !c.frozenAt && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCardAction(c.id, "FREEZE")}>
                        Freeze
                      </Button>
                    )}
                    {c.frozenAt && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => handleCardAction(c.id, "UNFREEZE")}>
                        Unfreeze
                      </Button>
                    )}
                    {c.status === "PENDING" && (
                      <Button size="sm" variant="destructive" className="text-xs" onClick={() => handleCardAction(c.id, "CANCEL")}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Loyalty Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Star className="w-5 h-5" /> Loyalty Cards</CardTitle>
          </CardHeader>
          <CardContent>
            {loyaltyCards.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No loyalty cards added</p>
            ) : loyaltyCards.map((c: any) => (
              <div key={c.id} className="p-3 border rounded-lg mb-2 flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">{c.merchantName}</p>
                  <p className="text-xs text-muted-foreground">#{c.cardNumber}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{c.pointsBalance} pts</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Gift Cards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gift className="w-5 h-5" /> Gift Cards</CardTitle>
          </CardHeader>
          <CardContent>
            {giftCards.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No gift cards added</p>
            ) : giftCards.map((c: any) => (
              <div key={c.id} className="p-3 border rounded-lg mb-2 flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">{c.merchantName}</p>
                  <p className="text-xs text-muted-foreground">#{c.cardNumber}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{c.balance} {c.currency}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
