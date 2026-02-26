import { POST } from "@/app/api/auth/2fa/route";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { generateTotpSecret, generateTotpUri, verifyTotpCode } from "@/lib/totp";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
}));

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

jest.mock("@/lib/crypto", () => ({
  encrypt: jest.fn(),
  decrypt: jest.fn(),
}));

jest.mock("@/lib/totp", () => ({
  generateTotpSecret: jest.fn(),
  verifyTotpCode: jest.fn(),
  generateTotpUri: jest.fn(),
}));

describe("Auth 2FA Route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.update as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
  });

  test("returns 400 for malformed JSON body", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "user@example.com",
      twoFaEnabled: false,
      twoFaSecret: null,
    });

    const req = new Request("http://localhost:3000/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("returns 400 when action is invalid type", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "user@example.com",
      twoFaEnabled: false,
      twoFaSecret: null,
    });

    const req = new Request("http://localhost:3000/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: 123 }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  test("setup generates and stores secret", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "user@example.com",
      twoFaEnabled: false,
      twoFaSecret: null,
    });
    (generateTotpSecret as unknown as jest.Mock).mockReturnValue("raw-secret");
    (encrypt as unknown as jest.Mock).mockReturnValue("enc-secret");
    (generateTotpUri as unknown as jest.Mock).mockReturnValue("otpauth://totp/test");

    const req = new Request("http://localhost:3000/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: " setup " }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { twoFaSecret: "enc-secret" } })
    );
  });

  test("verify returns 400 for invalid code format", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "user@example.com",
      twoFaEnabled: false,
      twoFaSecret: "enc-secret",
    });

    const req = new Request("http://localhost:3000/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", code: "12ab" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("verify enables 2FA when code is valid", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "user@example.com",
      twoFaEnabled: false,
      twoFaSecret: "enc-secret",
    });
    (decrypt as unknown as jest.Mock).mockReturnValue("raw-secret");
    (verifyTotpCode as unknown as jest.Mock).mockReturnValue(true);

    const req = new Request("http://localhost:3000/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", code: "123456" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { twoFaEnabled: true } })
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  test("disable returns 400 when secret is missing", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      email: "user@example.com",
      twoFaEnabled: true,
      twoFaSecret: null,
    });

    const req = new Request("http://localhost:3000/api/auth/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", code: "123456" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
