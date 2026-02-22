import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/contacts?search=...
 * Returns user's contact / address book.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    const where: any = { userId: user.id };
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
    const body = await request.json();

    const { name, address, email, phone, isFavorite } = body;

    if (!name || !address) {
      return NextResponse.json(
        { error: "name and address are required" },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.create({
      data: {
        userId: user.id,
        name,
        address: address.toLowerCase(),
        email: email || null,
        phone: phone || null,
        isFavorite: !!isFavorite,
      },
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: "Contact with this address already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/contacts
 * Body: { contactId }
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { contactId } = await request.json();

    if (!contactId) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 });
    }

    await prisma.contact.deleteMany({
      where: { id: contactId, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
