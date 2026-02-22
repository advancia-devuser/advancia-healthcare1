"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

/* ─── Types ─── */

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (opts: { type?: ToastType; title: string; description?: string }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

/* ─── Context ─── */

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/* ─── Config ─── */

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle className="w-5 h-5" />,
  error: <XCircle className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
};

const COLORS: Record<ToastType, { bg: string; border: string; icon: string; title: string }> = {
  success: { bg: "bg-green-50", border: "border-green-200", icon: "text-green-600", title: "text-green-900" },
  error: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-600", title: "text-red-900" },
  warning: { bg: "bg-yellow-50", border: "border-yellow-200", icon: "text-yellow-600", title: "text-yellow-900" },
  info: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600", title: "text-blue-900" },
};

const AUTO_DISMISS_MS = 5000;

/* ─── Provider ─── */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (opts: { type?: ToastType; title: string; description?: string }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const toast: Toast = { id, type: opts.type || "info", title: opts.title, description: opts.description };
      setToasts((prev) => [...prev.slice(-4), toast]); // max 5 visible
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const value: ToastContextValue = {
    toast: addToast,
    success: (title, description) => addToast({ type: "success", title, description }),
    error: (title, description) => addToast({ type: "error", title, description }),
    warning: (title, description) => addToast({ type: "warning", title, description }),
    info: (title, description) => addToast({ type: "info", title, description }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast Container */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none"
        style={{ maxWidth: 380 }}
      >
        {toasts.map((t) => {
          const c = COLORS[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg ${c.bg} ${c.border} animate-in slide-in-from-right-5 fade-in duration-300`}
            >
              <span className={`mt-0.5 flex-shrink-0 ${c.icon}`}>{ICONS[t.type]}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${c.title}`}>{t.title}</p>
                {t.description && (
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
