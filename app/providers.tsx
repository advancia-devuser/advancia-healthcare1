"use client";
import { config, queryClient } from "@/config";
import { AlchemyAccountProvider } from "@account-kit/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren } from "react";
import { AuthSync } from "./components/auth-sync";

export const Providers = (
  props: PropsWithChildren<{ initialState?: any }>
) => {
  return (
    <QueryClientProvider client={queryClient}>
      <AlchemyAccountProvider
        config={config}
        queryClient={queryClient}
        initialState={props.initialState}
      >
        <AuthSync />
        {props.children}
      </AlchemyAccountProvider>
    </QueryClientProvider>
  );
};
