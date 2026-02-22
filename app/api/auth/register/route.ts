import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/auth/register
 * Body: { address: string, email?: string }
 * Upserts a user by wallet address. Returns the user record.
 */
export async function POST(request: Request) {
  try {
    const { address, email } = await request.json();
    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const user = await resolveUser(address);

    // Optionally attach email
    if (email && !user.email) {
      await prisma.user.update({
        where: { id: user.id },
        data: { email },
      });
      user.email = email;
    }

    return NextResponse.json({ user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
