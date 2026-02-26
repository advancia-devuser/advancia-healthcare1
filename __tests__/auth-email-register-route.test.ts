import { POST } from "@/app/api/auth/email/register/route";
import { checkRateLimitPersistent, getClientIP, signUserToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

const cookieSetMock = jest.fn();

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({
    set: cookieSetMock,
  })),
}));

jest.mock("@/lib/auth", () => ({
  signUserToken: jest.fn(),
  checkRateLimitPersistent: jest.fn(),
  getClientIP: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
}));

describe("Email Register API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getClientIP as unknown as jest.Mock).mockReturnValue("127.0.0.1");
    (checkRateLimitPersistent as unknown as jest.Mock).mockResolvedValue(true);
    (signUserToken as unknown as jest.Mock).mockResolvedValue("token");
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue(null);
    (bcrypt.hash as unknown as jest.Mock).mockResolvedValue("hashed");
    (prisma.user.create as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "email-placeholder",
      email: "a@b.com",
      name: "User",
      status: "PENDING",
    });
  });

  test("returns 429 when rate limit exceeded", async () => {
    (checkRateLimitPersistent as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/auth/email/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret123" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/auth/email/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns 400 for invalid email", async () => {
    const req = new Request("http://localhost:3000/api/auth/email/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bad", password: "secret123" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns 400 for short password", async () => {
    const req = new Request("http://localhost:3000/api/auth/email/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "123" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns 400 for empty name when provided", async () => {
    const req = new Request("http://localhost:3000/api/auth/email/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret123", name: "  " }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns 409 when email already exists", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({ id: "u-existing" });

    const req = new Request("http://localhost:3000/api/auth/email/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret123" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("creates user, sets cookie, and returns success", async () => {
    const req = new Request("http://localhost:3000/api/auth/email/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: " A@B.COM ", password: "secret123", name: " User " }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "a@b.com" } });
    expect(bcrypt.hash).toHaveBeenCalledWith("secret123", 12);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "a@b.com",
          name: "User",
          status: "PENDING",
        }),
      })
    );
    expect(signUserToken).toHaveBeenCalledWith("u1", "email-placeholder");
    expect(cookieSetMock).toHaveBeenCalledWith(
      "user_session",
      "token",
      expect.objectContaining({ httpOnly: true, path: "/" })
    );
  });
});
