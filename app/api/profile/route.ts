import { NextResponse } from "next/server";
import { getAuthUser, requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/profile
 * Body: { name?, email?, phone?, avatarUrl? }
 * Update user profile fields.
 */
export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, phone, avatarUrl } = body;

    const updateData: Record<string, string> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
