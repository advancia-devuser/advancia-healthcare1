import { POST } from "@/app/api/auth/verify-email/route";
import { prisma } from "@/lib/db";
import { getAuthUser, checkRateLimit, getClientIP } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth", () => ({
  getAuthUser: jest.fn(),
  checkRateLimit: jest.fn(() => true),
  getClientIP: jest.fn(() => "1.2.3.4"),
}));

jest.mock("@/lib/email", () => ({
  sendVerificationEmail: jest.fn(async () => ({ success: true, messageId: "dev" })),
}));

describe("Email Verification API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkRateLimit as unknown as jest.Mock).mockReturnValue(true);
    (getClientIP as unknown as jest.Mock).mockReturnValue("1.2.3.4");
  });

  test("send stores a code and emails it", async () => {
    (getAuthUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "test@example.com",
      emailVerified: false,
      status: "PENDING",
    });

    (prisma.user.update as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const updateArgs = (prisma.user.update as unknown as jest.Mock).mock.calls[0][0];
    const savedToken = updateArgs.data.emailVerificationToken as string;

    expect(savedToken).toMatch(/^[0-9A-F]{8}$/);
    expect(updateArgs.data.emailVerificationExpiry).toBeInstanceOf(Date);

    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect((sendVerificationEmail as unknown as jest.Mock).mock.calls[0][0]).toBe("test@example.com");
    expect((sendVerificationEmail as unknown as jest.Mock).mock.calls[0][1]).toBe(savedToken);
  });

  test("verify accepts case-insensitive code and auto-approves PENDING user", async () => {
    (getAuthUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "test@example.com",
      emailVerified: false,
      emailVerificationToken: "ABCDEF12",
      emailVerificationExpiry: new Date(Date.now() + 60_000),
      status: "PENDING",
    });

    (prisma.user.update as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", token: "abcdef12" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.verified).toBe(true);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const updateArgs = (prisma.user.update as unknown as jest.Mock).mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "u1" });
    expect(updateArgs.data.emailVerified).toBe(true);
    expect(updateArgs.data.emailVerificationToken).toBeNull();
    expect(updateArgs.data.emailVerificationExpiry).toBeNull();
    expect(updateArgs.data.status).toBe("APPROVED");

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
});
