import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/auth/me
 * Returns the current user + wallet info based on x-wallet-address header.
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

    return NextResponse.json({ user, wallet });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
