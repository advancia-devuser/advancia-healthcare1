"use client";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, ShieldCheck, Menu, X } from "lucide-react";
import { useLogout, useSignerStatus } from "@account-kit/react";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import NotificationsDropdown from "./notifications-dropdown";

export default function Header() {
  const { logout } = useLogout();
  const { isConnected } = useSignerStatus();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/#features", label: "Features" },
    { href: "/#how-it-works", label: "How It Works" },
    { href: "/#security", label: "Security" },
    { href: "/#faq", label: "FAQ" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">

        {/* Logo + Tagline */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image
            src="/logo.svg"
            alt="Advancia Healthcare Logo"
            width={36}
            height={36}
            className="rounded-xl shadow-lg group-hover:shadow-blue-500/30 transition-all"
            priority
          />
          <div className="flex flex-col leading-none">
            <span className="text-base font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
              Advancia Healthcare
            </span>
            <span className="text-[9px] text-muted-foreground tracking-wider uppercase font-medium">
              Your Health. Your Control.
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(l => (
            <Link key={l.href} href={l.href}
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary rounded-lg hover:bg-muted/60 transition-all">
              {l.label}
            </Link>
          ))}
          {isConnected && (
            <>
              <Link href="/dashboard"
                className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary rounded-lg hover:bg-muted/60 transition-all flex items-center gap-1">
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </Link>
              <Link href="/admin"
                className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary rounded-lg hover:bg-muted/60 transition-all flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> Admin
              </Link>
            </>
          )}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="hidden md:flex items-center gap-3">
              <NotificationsDropdown />
              <Button
                variant="outline"
                size="sm"
                className="flex gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl"
                onClick={() => logout()}
              >
                <LogOut className="h-4 w-4" /> Logout
              </Button>
            </div>
          ) : (
            <Link href="/">
              <Button size="sm" className="hidden md:flex bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl shadow-md hover:shadow-blue-500/30 transition-all">
                Get Started
              </Button>
            </Link>
          )}
          {/* Mobile menu toggle */}
          <div className="flex items-center gap-2 md:hidden">
            {isConnected && (
              <NotificationsDropdown />
            )}
            <button className="p-2 rounded-lg hover:bg-muted" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-background px-4 py-3 space-y-1">
          {navLinks.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
              className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">{l.label}</Link>
          ))}
          {isConnected && (
            <>
              <Link href="/dashboard" onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Dashboard</Link>
              <Link href="/admin" onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Admin</Link>
              <button onClick={() => { logout(); setMobileOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50">Logout</button>
            </>
          )}
        </div>
      )}
    </header>
  );
}
