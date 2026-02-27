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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { address, email } = body as { address?: unknown; email?: unknown };
    if (typeof address !== "string" || !address.trim()) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const user = await resolveUser(address.trim());

    // Optionally attach email
    const normalizedEmail = typeof email === "string" ? email.trim() : "";
    if (normalizedEmail && !user.email) {
      await prisma.user.update({
        where: { id: user.id },
        data: { email: normalizedEmail },
      });
      user.email = normalizedEmail;
    }

    return NextResponse.json({ user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
