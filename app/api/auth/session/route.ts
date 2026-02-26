/**
 * User Session API
 * ────────────────
 * POST /api/auth/session → Issue a user JWT session from wallet address
 * DELETE /api/auth/session → Logout (clear cookie)
 *
 * SECURITY: Requires a signed nonce to prove address ownership.
 * The client must call GET first to obtain a nonce, then sign it
 * with the wallet and POST the signature back.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  resolveUser,
  signUserToken,
  checkRateLimitPersistent,
  getClientIP,
  storeAuthNonce,
  consumeAuthNonce,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyMessage } from "viem";

function normalizeAddress(value: unknown): `0x${string}` | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    return null;
  }
  return normalized as `0x${string}`;
}

function normalizeHexSignature(value: unknown): `0x${string}` | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!/^0x[a-fA-F0-9]+$/.test(normalized)) {
    return null;
  }
  return normalized as `0x${string}`;
}

function normalizeNonce(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * GET /api/auth/session?address=0x...
 * Returns a nonce for the client to sign, proving address ownership.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = normalizeAddress(searchParams.get("address"));
  if (!address) {
    return NextResponse.json({ error: "valid address query param required" }, { status: 400 });
  }
  const nonce = generateNonce();
  await storeAuthNonce(address, nonce, 5 * 60_000);
  return NextResponse.json({
    nonce,
    message: `Sign this message to verify your wallet ownership.\n\nNonce: ${nonce}`,
  });
}

/**
 * POST /api/auth/session
 * Body: { address: string, signature: string, nonce: string }
 * Verifies the signature proves address ownership before issuing JWT.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIP(request);
    if (!(await checkRateLimitPersistent(`session:${ip}`, 10, 60_000))) {
      return NextResponse.json({ error: "Too many attempts. Try later." }, { status: 429 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { address, signature, nonce } = body as {
      address?: unknown;
      signature?: unknown;
      nonce?: unknown;
    };

    const normalizedAddress = normalizeAddress(address);
    const normalizedSignature = normalizeHexSignature(signature);
    const normalizedNonce = normalizeNonce(nonce);

    if (!normalizedAddress) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    if (!normalizedSignature || !normalizedNonce) {
      return NextResponse.json({ error: "signature and nonce are required" }, { status: 400 });
    }

    const lower = normalizedAddress;

    // Verify and consume one-time nonce
    const storedNonce = await consumeAuthNonce(lower);
    if (!storedNonce || storedNonce !== normalizedNonce) {
      return NextResponse.json(
        { error: "Invalid or expired nonce. Request a new one via GET." },
        { status: 401 }
      );
    }

    // Verify signature (EIP-191 personal sign)
    const message = `Sign this message to verify your wallet ownership.\n\nNonce: ${normalizedNonce}`;
    let isValid = false;
    try {
      isValid = await verifyMessage({
        address: lower,
        message,
        signature: normalizedSignature,
      });
    } catch {
      isValid = false;
    }

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const user = await resolveUser(lower);
    const token = await signUserToken(user.id, user.address);

    // Set httpOnly cookie
    const cookieStore = await cookies();
    cookieStore.set("user_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    // Log device
    const ua = request.headers.get("user-agent") || "unknown";

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "USER_SESSION_CREATED",
        meta: JSON.stringify({ ip, userAgent: ua.slice(0, 200) }),
      },
    });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        address: user.address,
        email: user.email,
        name: user.name,
        status: user.status,
        role: user.role,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/session
 * Clears the user_session cookie (logout).
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set("user_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return NextResponse.json({ ok: true });
}
