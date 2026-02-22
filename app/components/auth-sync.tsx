"use client";

import { useEffect, useRef } from "react";
import { useUser, useSignerStatus } from "@account-kit/react";
import { useSmartAccountClient } from "@account-kit/react";

/**
 * AuthSync — Exchanges Alchemy Account Kit session for a secure backend JWT.
 *
 * SECURITY: Uses EIP-191 signature challenge to prove wallet ownership.
 * 1. GET /api/auth/session?address=... → receives nonce
 * 2. Signs nonce with the embedded signer
 * 3. POST /api/auth/session → sends address + signature + nonce → receives httpOnly JWT cookie
 */
export function AuthSync() {
  const user = useUser();
  const { client } = useSmartAccountClient({});
  const signerStatus = useSignerStatus();
  const syncing = useRef(false);
  const lastAddress = useRef<string | null>(null);

  useEffect(() => {
    const address = user?.address;
    if (!address || !signerStatus.isConnected || syncing.current) return;
    if (lastAddress.current === address) return; // already synced for this address

    syncing.current = true;

    (async () => {
      try {
        // 1. Register user
        await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, email: user.email || undefined }),
        });

        // 2. Get challenge nonce
        const nonceRes = await fetch(`/api/auth/session?address=${address}`);
        const { nonce, message } = await nonceRes.json();
        if (!nonce || !message) throw new Error("Failed to get nonce");

        // 3. Sign the message with the embedded signer (Account Kit)
        let signature: string;
        if (client) {
          signature = await client.signMessage({ message });
        } else {
          // Fallback: try user signer directly via window.ethereum
          throw new Error("Smart account client not ready");
        }

        // 4. Exchange signature for JWT session
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, signature, nonce }),
        });

        lastAddress.current = address;
      } catch (err) {
        console.error("[AuthSync] Session creation failed:", err);
      } finally {
        syncing.current = false;
      }
    })();
  }, [user?.address, user?.email, signerStatus.isConnected, client]);

  return null;
}
