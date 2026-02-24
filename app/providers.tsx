"use client";
import { config, queryClient } from "@/config";
import { AlchemyAccountProvider } from "@account-kit/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren, createContext, useContext, Component, ReactNode } from "react";
import { AuthSync } from "./components/auth-sync";
import { AuthProvider } from "./hooks/useAuth";

/* ------------------------------------------------------------------ */
/*  Context: lets any child component know if Alchemy is available    */
/* ------------------------------------------------------------------ */
export const AlchemyAvailableContext = createContext<boolean>(true);
export const useAlchemyAvailable = () => useContext(AlchemyAvailableContext);

/* ------------------------------------------------------------------ */
/*  React Error Boundary – catches Alchemy runtime / render errors    */
/* ------------------------------------------------------------------ */
interface EBProps { fallback: ReactNode; children: ReactNode }
interface EBState { hasError: boolean }

class AlchemyErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn("[AlchemyErrorBoundary] Alchemy failed, falling back to email/password auth:", error.message);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Providers wrapper                                            */
/* ------------------------------------------------------------------ */
export const Providers = (
  props: PropsWithChildren<{ initialState?: any }>
) => {
  // Fallback tree: no Alchemy, email/password auth still works
  const fallbackTree = (
    <AlchemyAvailableContext.Provider value={false}>
      <AuthProvider>
        {props.children}
      </AuthProvider>
    </AlchemyAvailableContext.Provider>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AlchemyErrorBoundary fallback={fallbackTree}>
        <AlchemyAccountProvider
          config={config}
          queryClient={queryClient}
          initialState={props.initialState}
        >
          <AlchemyAvailableContext.Provider value={true}>
            <AuthProvider>
              <AuthSync />
              {props.children}
            </AuthProvider>
          </AlchemyAvailableContext.Provider>
        </AlchemyAccountProvider>
      </AlchemyErrorBoundary>
    </QueryClientProvider>
  );
};
