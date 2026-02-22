import { FileQuestion, Home, ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * Global 404 page — renders when a route is not found.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden text-center">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-8 py-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4">
            <FileQuestion className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-6xl font-black text-white">404</h1>
          <p className="text-teal-100 mt-2 text-sm">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-8 space-y-4">
          <p className="text-gray-500 text-sm">
            This page may have been moved, deleted, or the URL might be incorrect.
          </p>

          <div className="flex gap-3">
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-5 rounded-xl transition-colors shadow-sm"
            >
              <Home className="w-4 h-4" />
              Go Home
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-5 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
