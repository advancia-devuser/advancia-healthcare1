import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return normalizeNonEmptyString(value);
}

function normalizeSearch(value: string | null): string {
  return (value || "").trim();
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * GET /api/contacts?search=...
 * Returns user's contact / address book.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const search = normalizeSearch(searchParams.get("search"));

    const where: {
      userId: string;
      OR?: Array<
        | { name: { contains: string } }
        | { address: { contains: string } }
        | { email: { contains: string } }
      >;
    } = { userId: user.id };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { address: { contains: search.toLowerCase() } },
        { email: { contains: search } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ contacts });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/contacts
 * Body: { name, address, email?, phone?, isFavorite? }
 * Add a new contact.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, address, email, phone, isFavorite } = body as {
      name?: unknown;
      address?: unknown;
      email?: unknown;
      phone?: unknown;
      isFavorite?: unknown;
    };

    const normalizedName = normalizeNonEmptyString(name);
    const normalizedAddress = normalizeNonEmptyString(address);
    const normalizedEmail = normalizeOptionalString(email);
    const normalizedPhone = normalizeOptionalString(phone);

    if (!normalizedName || !normalizedAddress) {
      return NextResponse.json(
        { error: "name and address are required" },
        { status: 400 }
      );
    }

    if (normalizedEmail && !isLikelyEmail(normalizedEmail)) {
      return NextResponse.json({ error: "email must be a valid email address" }, { status: 400 });
    }

    const contact = await prisma.contact.create({
      data: {
        userId: user.id,
        name: normalizedName,
        address: normalizedAddress.toLowerCase(),
        email: normalizedEmail,
        phone: normalizedPhone,
        isFavorite: isFavorite === true,
      },
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Contact with this address already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/contacts
 * Body: { contactId }
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { contactId } = body as { contactId?: unknown };
    const normalizedContactId = normalizeNonEmptyString(contactId);

    if (!normalizedContactId) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 });
    }

    await prisma.contact.deleteMany({
      where: { id: normalizedContactId, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
