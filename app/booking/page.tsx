"use client";

import { useSignerStatus } from "@account-kit/react";
import Header from "../components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Activity, CheckCircle2, Loader2, X, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

interface ChamberInfo {
  id: string;
  name: string;
  type: string;
  pricePerHour: number;
}

interface Booking {
  id: string;
  chamber: string;
  chamberName: string;
  date: string;
  timeSlot: string;
  duration: number; // minutes
  priceUsd: string;
  status: string;
  paidWithAsset?: string;
  createdAt: string;
}

export default function BookingPage() {
  const signerStatus = useSignerStatus();
  const router = useRouter();

  const [chambers, setChambers] = useState<ChamberInfo[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedChamber, setSelectedChamber] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [duration, setDuration] = useState(1);
  const [payWithWallet, setPayWithWallet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const times = ["09:00 AM", "11:00 AM", "02:00 PM", "04:00 PM"];

  useEffect(() => {
    if (!signerStatus.isConnected && !signerStatus.isInitializing) {
      router.push("/");
    }
  }, [signerStatus.isConnected, signerStatus.isInitializing, router]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/booking", { headers: { "Content-Type": "application/json" } });
      if (res.ok) {
        const data = await res.json();
        setChambers(data.chambers || []);
        setBookings(data.bookings || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (signerStatus.isConnected) fetchData();
  }, [signerStatus.isConnected, fetchData]);

  if (!signerStatus.isConnected) return null;

  const chamberInfo = chambers.find((c) => c.id === selectedChamber);
  const totalPrice = chamberInfo ? chamberInfo.pricePerHour * duration : 0;

  // Get minimum date (today)
  const today = new Date().toISOString().split("T")[0];

  async function handleBook() {
    if (!selectedChamber || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chamber: selectedChamber,
          date: selectedDate,
          timeSlot: selectedTime,
          duration,
          payWithWallet,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Booking confirmed! ${chamberInfo?.name} on ${selectedDate} at ${selectedTime}`);
      setBookings([data.booking, ...bookings]);
      // Reset form
      setSelectedChamber(null);
      setSelectedDate("");
      setSelectedTime("");
      setDuration(1);
      setPayWithWallet(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(bookingId: string) {
    try {
      const res = await fetch("/api/booking", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBookings(bookings.map((b) => (b.id === bookingId ? data.booking : b)));
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Book a Medbed Session</h1>
            <p className="text-muted-foreground mt-1">Choose your chamber, date, and time to book a healing session</p>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
            <button onClick={() => setError("")} className="ml-auto"><X className="w-4 h-4 text-red-400" /></button>
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800">{success}</p>
            <button onClick={() => setSuccess("")} className="ml-auto"><X className="w-4 h-4 text-green-400" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-8">
              {/* Chamber Selection */}
              <div className="md:col-span-2 space-y-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Select Chamber
                </h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  {chambers.map((chamber) => (
                    <Card
                      key={chamber.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedChamber === chamber.id ? "ring-2 ring-primary border-primary" : ""
                      }`}
                      onClick={() => setSelectedChamber(chamber.id)}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{chamber.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{chamber.type}</p>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-primary">${chamber.pricePerHour}<span className="text-sm font-normal text-muted-foreground">/hr</span></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Date & Time Selection */}
                {selectedChamber && (
                  <div className="space-y-6 pt-6 border-t">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-primary" />
                      Select Date & Time
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Date</label>
                        <input
                          type="date"
                          min={today}
                          className="w-full p-3 border rounded-xl bg-background"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Time Slot</label>
                        <div className="grid grid-cols-2 gap-2">
                          {times.map((time) => (
                            <Button
                              key={time}
                              variant={selectedTime === time ? "default" : "outline"}
                              onClick={() => setSelectedTime(time)}
                              className="w-full"
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              {time}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Duration (hours)</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map((h) => (
                          <Button
                            key={h}
                            variant={duration === h ? "default" : "outline"}
                            onClick={() => setDuration(h)}
                            className="flex-1"
                          >
                            {h}hr
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Payment Option */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-xl hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={payWithWallet}
                          onChange={(e) => setPayWithWallet(e.target.checked)}
                          className="w-4 h-4 rounded"
                        />
                        <div>
                          <p className="text-sm font-medium">Pay with Wallet Balance</p>
                          <p className="text-xs text-muted-foreground">Debit from your crypto wallet. Leave unchecked to pay at the session.</p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Booking Summary Sidebar */}
              <div>
                <Card className="sticky top-8">
                  <CardHeader>
                    <CardTitle>Booking Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedChamber && chamberInfo ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Chamber</span>
                          <span className="font-medium">{chamberInfo.name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Rate</span>
                          <span className="font-medium">${chamberInfo.pricePerHour}/hr</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Duration</span>
                          <span className="font-medium">{duration} hour{duration > 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Date</span>
                          <span className="font-medium">{selectedDate || "Not selected"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Time</span>
                          <span className="font-medium">{selectedTime || "Not selected"}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Payment</span>
                          <span className="font-medium">{payWithWallet ? "Wallet" : "At Session"}</span>
                        </div>
                        <div className="pt-4 border-t flex justify-between font-bold text-lg">
                          <span>Total</span>
                          <span className="text-primary">${totalPrice.toFixed(2)}</span>
                        </div>
                        <Button
                          className="w-full mt-4 gap-2 h-12"
                          disabled={!selectedDate || !selectedTime || submitting}
                          onClick={handleBook}
                        >
                          {submitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          {submitting ? "Booking..." : "Confirm Booking"}
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Select a chamber to view your booking summary.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* My Bookings History */}
            {bookings.length > 0 && (
              <div className="mt-12">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  My Bookings
                </h2>
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      {bookings.map((b) => (
                        <div key={b.id} className="flex items-center justify-between p-4 border rounded-xl">
                          <div>
                            <p className="font-semibold">{b.chamberName}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(b.date + "T00:00:00").toLocaleDateString()} at {b.timeSlot} &middot; {Math.round(b.duration / 60)}hr
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-bold">${parseFloat(b.priceUsd).toFixed(2)}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                b.status === "CONFIRMED" ? "bg-green-100 text-green-800" :
                                b.status === "PENDING" ? "bg-yellow-100 text-yellow-800" :
                                b.status === "CANCELLED" ? "bg-red-100 text-red-800" :
                                b.status === "COMPLETED" ? "bg-blue-100 text-blue-800" :
                                "bg-gray-100 text-gray-800"
                              }`}>{b.status}</span>
                            </div>
                            {(b.status === "PENDING" || b.status === "CONFIRMED") && (
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => handleCancel(b.id)}>
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
