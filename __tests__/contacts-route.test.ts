import { DELETE, GET, POST } from "@/app/api/contacts/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

describe("Contacts API", () => {
  const approvedUser = {
    id: "u1",
    address: "0xabc123",
    status: "APPROVED",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(approvedUser);
  });

  test("GET applies search filters", async () => {
    (prisma.contact.findMany as unknown as jest.Mock).mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/contacts?search=Alice");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "u1",
          OR: expect.any(Array),
        }),
      })
    );
  });

  test("GET without search does not include OR filters", async () => {
    (prisma.contact.findMany as unknown as jest.Mock).mockResolvedValue([]);

    const req = new Request("http://localhost:3000/api/contacts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
      })
    );
  });

  test("GET passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const req = new Request("http://localhost:3000/api/contacts");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  test("POST rejects missing required fields", async () => {
    const req = new Request("http://localhost:3000/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  test("POST rejects invalid email", async () => {
    const req = new Request("http://localhost:3000/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice",
        address: "0xabc",
        email: "invalid-email",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  test("POST normalizes fields and creates contact", async () => {
    (prisma.contact.create as unknown as jest.Mock).mockResolvedValue({ id: "c1" });

    const req = new Request("http://localhost:3000/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  Alice Doe  ",
        address: "  0xABCDEF  ",
        email: "  alice@example.com  ",
        phone: "  +123  ",
        isFavorite: true,
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          name: "Alice Doe",
          address: "0xabcdef",
          email: "alice@example.com",
          phone: "+123",
          isFavorite: true,
        }),
      })
    );
  });

  test("POST maps duplicate address errors to 409", async () => {
    (prisma.contact.create as unknown as jest.Mock).mockRejectedValue({ code: "P2002" });

    const req = new Request("http://localhost:3000/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice",
        address: "0xabc",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
  });

  test("DELETE rejects missing contactId", async () => {
    const req = new Request("http://localhost:3000/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.contact.deleteMany).not.toHaveBeenCalled();
  });

  test("DELETE returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.contact.deleteMany).not.toHaveBeenCalled();
  });

  test("DELETE removes only user-owned contact", async () => {
    (prisma.contact.deleteMany as unknown as jest.Mock).mockResolvedValue({ count: 1 });

    const req = new Request("http://localhost:3000/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: "c1" }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(prisma.contact.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", userId: "u1" } })
    );
  });

  test("DELETE passes through thrown Response errors", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockRejectedValue(
      Response.json({ error: "Rate limited" }, { status: 429 })
    );

    const req = new Request("http://localhost:3000/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: "c1" }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Rate limited");
    expect(prisma.contact.deleteMany).not.toHaveBeenCalled();
  });
});
