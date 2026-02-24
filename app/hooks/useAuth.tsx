"use client";

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";

/**
 * Unified auth context that works with BOTH:
 *  1. Alchemy Account Kit (wallet / Google / Passkey login)
 *  2. Email + password login (JWT cookie)
 *
 * Components should use `useAuth()` instead of Alchemy hooks directly.
 */

interface AuthUser {
  id: string;
  address: string;
  email?: string;
  name?: string;
  role: string;
  status: string;
}

interface AuthState {
  /** true when we're still checking the session */
  isLoading: boolean;
  /** true when the user has a valid session (either Alchemy or email/password) */
  isLoggedIn: boolean;
  /** The authenticated user, or null */
  user: AuthUser | null;
  /** Logout from the backend session */
  logout: () => Promise<void>;
  /** Re-check auth status */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isLoading: true,
  isLoggedIn: false,
  user: null,
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isLoggedIn: !!user,
        user,
        logout,
        refresh: checkSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
