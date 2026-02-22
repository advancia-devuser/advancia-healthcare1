"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, Minimize2, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";

type Message = {
  id: number;
  from: "user" | "bot";
  text: string;
  time: string;
};

const AUTO_REPLIES: Record<string, string> = {
  default: "Thank you for reaching out! A support agent will be with you shortly. In the meantime, check our FAQ.",
  booking: "To book a Medbed session, go to your Dashboard and click 'Book Medbed'. Choose your chamber and preferred time slot.",
  help: "I can assist with bookings, account issues, billing, and general questions. What do you need help with?",
  cancel: "To cancel a booking, go to your Dashboard → Bookings, then click 'Manage' on the session you wish to cancel.",
  price: "Our Medbed sessions start at $150/hr for Alpha Chamber, $250/hr for Beta, and $500/hr for Omega. Premium subscribers get 20% off.",
  password: "We use passwordless login — no passwords needed! Sign in with Google or a magic link sent to your email.",
  billing: "For billing inquiries, please email billing@advancia.health or use this chat. We respond within 2 business hours.",
  hello: "Hello! Welcome to Advancia Healthcare support. How can I help you today? 😊",
  hi: "Hi there! 👋 I'm the Advancia support assistant. What can I help you with?",
};

function getReply(text: string): string {
  const lower = text.toLowerCase();
  for (const key of Object.keys(AUTO_REPLIES)) {
    if (key !== "default" && lower.includes(key)) return AUTO_REPLIES[key];
  }
  return AUTO_REPLIES.default;
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function LiveChat() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      from: "bot",
      text: "👋 Hi! I'm Adva, your Advancia Health assistant. How can I help you today?",
      time: now(),
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !minimized) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, minimized]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now(), from: "user", text: input, time: now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    setTimeout(() => {
      const reply: Message = { id: Date.now() + 1, from: "bot", text: getReply(userMsg.text), time: now() };
      setMessages(prev => [...prev, reply]);
      setIsTyping(false);
    }, 900);
  };

  return (
    <>
      {/* Chat window */}
      {open && (
        <div className={`fixed bottom-24 right-6 z-50 w-[340px] md:w-[380px] shadow-2xl shadow-teal-900/20 rounded-2xl overflow-hidden transition-all duration-300 ${minimized ? "h-16" : "h-[520px]"} flex flex-col border border-gray-200 bg-white`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-5 py-4 flex items-center justify-between text-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/30">
                <HeartPulse className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-base font-bold leading-tight">Adva Support</p>
                <p className="text-xs text-teal-100 font-medium mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  Usually replies instantly
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMinimized(!minimized)} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                <Minimize2 className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Quick replies */}
              <div className="bg-gray-50/80 border-b border-gray-100 px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
                {["Booking help", "Pricing", "Cancel session"].map(q => (
                  <button key={q} onClick={() => { setInput(q); }}
                    className="text-xs font-medium bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-all whitespace-nowrap shadow-sm">
                    {q}
                  </button>
                ))}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-white">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"} gap-2.5`}>
                    {msg.from === "bot" && (
                      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 mt-1 border border-teal-200">
                        <Bot className="w-4 h-4 text-teal-600" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                      msg.from === "user"
                        ? "bg-teal-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}>
                      {msg.text}
                      <p className={`text-[10px] mt-1.5 font-medium text-right ${msg.from === "user" ? "text-teal-100" : "text-gray-400"}`}>{msg.time}</p>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center border border-teal-200">
                      <Bot className="w-4 h-4 text-teal-600" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3.5 flex items-center gap-1.5 shadow-sm">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-100 p-4 bg-white flex gap-2 items-center">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()}
                  placeholder="Type your message..."
                  className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all placeholder:text-gray-400"
                />
                <Button size="icon" onClick={sendMessage} disabled={!input.trim()}
                  className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-600/20 border-0 h-10 w-10 transition-all disabled:opacity-50 disabled:shadow-none">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* FAB toggle button */}
      <button
        onClick={() => { setOpen(!open); setMinimized(false); }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/30 flex items-center justify-center transition-all duration-300 hover:scale-105 hover:bg-teal-700 active:scale-95"
      >
        {open ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}
      </button>
    </>
  );
}
