"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";

export default function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem("cookie-consent", "true");
    setIsVisible(false);
  };

  const declineCookies = () => {
    localStorage.setItem("cookie-consent", "false");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[400px] bg-white border border-gray-200 rounded-2xl p-5 z-50 shadow-2xl shadow-teal-900/10 animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-50 rounded-full">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Security & Cookies</h3>
        </div>
        <button onClick={declineCookies} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <p className="text-sm text-gray-600 mb-5 leading-relaxed">
        We use cookies to enhance your experience, analyze site traffic, and serve tailored content. By continuing to use our site, you consent to our use of cookies. Read our <Link href="/privacy" className="text-teal-600 font-medium hover:underline">Privacy Policy</Link> and <Link href="/terms" className="text-teal-600 font-medium hover:underline">Terms of Service</Link>.
      </p>
      
      <div className="flex gap-3 w-full">
        <Button variant="outline" className="flex-1 h-10 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900" onClick={declineCookies}>
          Decline
        </Button>
        <Button className="flex-1 h-10 rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-600/20" onClick={acceptCookies}>
          Accept All
        </Button>
      </div>
    </div>
  );
}
