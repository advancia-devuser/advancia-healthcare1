import { NextResponse } from "next/server";
import { getAuthUser, requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function normalizeOptionalNonEmptyString(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeOptionalEmail(value: unknown): string | null {
  const normalized = normalizeOptionalNonEmptyString(value);
  if (!normalized) {
    return null;
  }
  const lower = normalized.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
    return null;
  }
  return lower;
}

/**
 * GET /api/profile
 * Returns user profile with wallet info.
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });

    const balances = await prisma.walletBalance.findMany({
      where: { userId: user.id },
      orderBy: { asset: "asc" },
      select: { asset: true, balance: true, updatedAt: true },
    });

    const ethBalance = balances.find((b) => b.asset === "ETH")?.balance ?? "0";

    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        address: user.address,
        email: user.email,
        name: user.name,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        has2FA: !!user.twoFaSecret,
        hasPin: !!user.pin,
        createdAt: user.createdAt,
      },
      wallet: wallet ? { ...wallet, balance: ethBalance } : wallet,
      balances,
      subscription,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/profile
 * Body: { name?, email?, phone?, avatarUrl? }
 * Update user profile fields.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, email, phone, avatarUrl } = body as {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      avatarUrl?: unknown;
    };

    const updateData: {
      name?: string;
      email?: string;
      phone?: string;
      avatarUrl?: string;
    } = {};

    if (name !== undefined) {
      const normalizedName = normalizeOptionalNonEmptyString(name);
      if (!normalizedName) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      updateData.name = normalizedName;
    }

    if (email !== undefined) {
      const normalizedEmail = normalizeOptionalEmail(email);
      if (!normalizedEmail) {
        return NextResponse.json({ error: "email must be a valid email address" }, { status: 400 });
      }
      updateData.email = normalizedEmail;
    }

    if (phone !== undefined) {
      const normalizedPhone = normalizeOptionalNonEmptyString(phone);
      if (!normalizedPhone) {
        return NextResponse.json({ error: "phone must be a non-empty string" }, { status: 400 });
      }
      updateData.phone = normalizedPhone;
    }

    if (avatarUrl !== undefined) {
      const normalizedAvatarUrl = normalizeOptionalNonEmptyString(avatarUrl);
      if (!normalizedAvatarUrl) {
        return NextResponse.json({ error: "avatarUrl must be a non-empty string" }, { status: 400 });
      }
      updateData.avatarUrl = normalizedAvatarUrl;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "PROFILE_UPDATE",
        meta: JSON.stringify({ fields: Object.keys(updateData) }),
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        address: updated.address,
        email: updated.email,
        name: updated.name,
        phone: updated.phone,
        avatarUrl: updated.avatarUrl,
        role: updated.role,
        status: updated.status,
        createdAt: updated.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
