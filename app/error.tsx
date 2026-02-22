"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * Global Error Boundary — catches unhandled errors in the app tree.
 * Rendered by Next.js automatically when an error is thrown.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to external error-tracking service (Sentry, LogRocket, etc.)
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-rose-600 px-8 py-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4">
            <AlertTriangle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
          <p className="text-red-100 mt-2 text-sm">
            An unexpected error occurred. Our team has been notified.
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-8 space-y-4">
          {process.env.NODE_ENV === "development" && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="text-xs font-mono text-red-700 break-all leading-relaxed">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-[10px] text-red-400 mt-2 font-mono">
                  Digest: {error.digest}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => reset()}
              className="flex-1 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-5 rounded-xl transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            <a
              href="/"
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-5 rounded-xl transition-colors"
            >
              <Home className="w-4 h-4" />
              Home
            </a>
          </div>

          <p className="text-center text-xs text-gray-400 pt-2">
            If this keeps happening, please contact{" "}
            <a href="mailto:support@advancia.health" className="text-teal-600 hover:underline">
              support@advancia.health
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
