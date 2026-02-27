import { POST } from "@/app/api/admin/2fa/route";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { generateTotpSecret, verifyTotpCode, generateTotpUri } from "@/lib/totp";

jest.mock("@/lib/auth", () => ({
  isAdminRequest: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    adminConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
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

describe("Admin 2FA API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(true);
  });

  test("returns 401 when request is not admin", async () => {
    (isAdminRequest as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test("returns 400 for invalid action", async () => {
    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.adminConfig.findUnique).not.toHaveBeenCalled();
  });

  test("status returns enabled false when no secret exists", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.enabled).toBe(false);
  });

  test("status returns enabled true when secret exists", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue({ value: "ENCRYPTED" });

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.enabled).toBe(true);
  });

  test("verify rejects non-numeric 6-digit code", async () => {
    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", code: "12AB56" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.adminConfig.findUnique).not.toHaveBeenCalled();
  });

  test("setup creates pending secret and returns uri", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue(null);
    (generateTotpSecret as unknown as jest.Mock).mockReturnValue("SECRET123");
    (generateTotpUri as unknown as jest.Mock).mockReturnValue("otpauth://test");
    (prisma.adminConfig.upsert as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.secret).toBe("SECRET123");
    expect(body.uri).toBe("otpauth://test");
    expect(prisma.adminConfig.upsert).toHaveBeenCalledTimes(1);
  });

  test("setup rejects when 2FA is already enabled", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue({ value: "ENCRYPTED" });

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.adminConfig.upsert).not.toHaveBeenCalled();
  });

  test("verify returns 400 when no pending secret exists", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", code: "123456" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.adminConfig.upsert).not.toHaveBeenCalled();
  });

  test("verify returns 400 for incorrect 6-digit code", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue({ value: "PENDINGSECRET" });
    (verifyTotpCode as unknown as jest.Mock).mockReturnValue(false);

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", code: "123456" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.adminConfig.upsert).not.toHaveBeenCalled();
  });

  test("verify enables 2FA and clears pending secret", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue({ value: "PENDINGSECRET" });
    (verifyTotpCode as unknown as jest.Mock).mockReturnValue(true);
    (encrypt as unknown as jest.Mock).mockReturnValue("ENCRYPTED");
    (prisma.adminConfig.upsert as unknown as jest.Mock).mockResolvedValue({});
    (prisma.adminConfig.delete as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", code: "123456" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(verifyTotpCode).toHaveBeenCalledWith("PENDINGSECRET", "123456");
    expect(encrypt).toHaveBeenCalledWith("PENDINGSECRET");
    expect(prisma.adminConfig.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.adminConfig.delete).toHaveBeenCalledTimes(1);
  });

  test("disable returns 400 when 2FA is not enabled", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", code: "123456" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("disable validates code and deletes enabled secret", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue({ value: "ENCRYPTED" });
    (decrypt as unknown as jest.Mock).mockReturnValue("DECRYPTED");
    (verifyTotpCode as unknown as jest.Mock).mockReturnValue(true);
    (prisma.adminConfig.delete as unknown as jest.Mock).mockResolvedValue({});

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", code: "123456" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(decrypt).toHaveBeenCalledWith("ENCRYPTED");
    expect(verifyTotpCode).toHaveBeenCalledWith("DECRYPTED", "123456");
    expect(prisma.adminConfig.delete).toHaveBeenCalledTimes(1);
  });

  test("disable returns 400 for incorrect verification code", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue({ value: "ENCRYPTED" });
    (decrypt as unknown as jest.Mock).mockReturnValue("DECRYPTED");
    (verifyTotpCode as unknown as jest.Mock).mockReturnValue(false);

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", code: "123456" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prisma.adminConfig.delete).not.toHaveBeenCalled();
  });

  test("returns 500 on unexpected internal errors", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const req = new Request("http://localhost:3000/api/admin/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
