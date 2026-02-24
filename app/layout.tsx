import { config } from "@/config";
import { cookieToInitialState } from "@account-kit/core";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import CookieBanner from "./components/cookie-banner";
import LiveChat from "./components/live-chat";
import { ToastProvider } from "./components/toast-provider";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Advancia Healthcare",
  description: "Your secure healthcare wallet and management platform.",
  icons: {
    icon: "/favicon.svg",
  },
  verification: {
    google: "qWEdN4dK64XhNoyRlwmNiDxcoVnNS6XNTsHz78Lx2hY",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Persist state across pages
  // https://www.alchemy.com/docs/wallets/react/ssr#persisting-the-account-state
  const cookieHeader = (await headers()).get("cookie") ?? undefined;
  const initialState = cookieToInitialState(
    config,
    cookieHeader
  );

  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers initialState={initialState}>
          <ToastProvider>
            {children}
            <CookieBanner />
            <LiveChat />
            <SpeedInsights />
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
