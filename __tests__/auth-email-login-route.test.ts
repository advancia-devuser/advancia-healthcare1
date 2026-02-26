import { POST } from "@/app/api/auth/email/login/route";
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
    },
  },
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
}));

describe("Email Login API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getClientIP as unknown as jest.Mock).mockReturnValue("127.0.0.1");
    (checkRateLimitPersistent as unknown as jest.Mock).mockResolvedValue(true);
    (signUserToken as unknown as jest.Mock).mockResolvedValue("token");
  });

  test("returns 429 when rate limit exceeded", async () => {
    (checkRateLimitPersistent as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/auth/email/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost:3000/api/auth/email/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns 400 for invalid email format", async () => {
    const req = new Request("http://localhost:3000/api/auth/email/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bad", password: "secret" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("returns 401 when user not found", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/auth/email/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  test("returns 401 when password is invalid", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "a@b.com",
      password: "hash",
    });
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/auth/email/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "secret" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  test("returns 200 and sets session cookie for valid credentials", async () => {
    (prisma.user.findUnique as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "a@b.com",
      name: "User",
      status: "APPROVED",
      password: "hash",
    });
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);

    const req = new Request("http://localhost:3000/api/auth/email/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: " A@B.COM ", password: "secret" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "a@b.com" } });
    expect(signUserToken).toHaveBeenCalledWith("u1", "0xabc");
    expect(cookieSetMock).toHaveBeenCalledWith(
      "user_session",
      "token",
      expect.objectContaining({ httpOnly: true, path: "/" })
    );
  });
});
