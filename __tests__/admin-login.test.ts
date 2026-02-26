import { DELETE, POST } from "@/app/api/admin/login/route";
import {
  signAdminToken,
  checkRateLimitPersistent,
  getClientIP,
  registerAdminFailure,
  getAdminLockRemainingMs,
  clearAdminFailureState,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyTotpCode } from "@/lib/totp";
import { decrypt } from "@/lib/crypto";
import { compare } from "bcryptjs";
import { assertAdminPasswordEnv } from "@/lib/env";

const cookieSetMock = jest.fn();

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({
    set: cookieSetMock,
  })),
}));

jest.mock("@/lib/auth", () => ({
  signAdminToken: jest.fn(),
  checkRateLimitPersistent: jest.fn(),
  getClientIP: jest.fn(),
  registerAdminFailure: jest.fn(),
  getAdminLockRemainingMs: jest.fn(),
  clearAdminFailureState: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    adminConfig: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/totp", () => ({
  verifyTotpCode: jest.fn(),
}));

jest.mock("@/lib/crypto", () => ({
  decrypt: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  assertAdminPasswordEnv: jest.fn(),
}));

describe("Admin Login API", () => {
  const originalHash = process.env.ADMIN_PASSWORD_HASH;
  const originalPlain = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_PASSWORD_HASH = "hash";
    delete process.env.ADMIN_PASSWORD;

    (assertAdminPasswordEnv as unknown as jest.Mock).mockImplementation(() => {});
    (getClientIP as unknown as jest.Mock).mockReturnValue("127.0.0.1");
    (getAdminLockRemainingMs as unknown as jest.Mock).mockResolvedValue(0);
    (checkRateLimitPersistent as unknown as jest.Mock).mockResolvedValue(true);
    (registerAdminFailure as unknown as jest.Mock).mockResolvedValue({ lockMs: 0 });
    (clearAdminFailureState as unknown as jest.Mock).mockResolvedValue(undefined);
    (compare as unknown as jest.Mock).mockResolvedValue(true);
    (signAdminToken as unknown as jest.Mock).mockResolvedValue("token");
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue(null);
  });

  afterAll(() => {
    process.env.ADMIN_PASSWORD_HASH = originalHash;
    process.env.ADMIN_PASSWORD = originalPlain;
  });

  test("POST returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  test("POST returns 401 when password is missing", async () => {
    const req = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(registerAdminFailure).toHaveBeenCalledTimes(1);
  });

  test("POST requires 2FA code when enabled", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue({ value: "encrypted" });

    const req = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "pass" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.requires2FA).toBe(true);
  });

  test("POST rejects non-numeric 2FA code", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue({ value: "encrypted" });

    const req = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "pass", totpCode: "12AB56" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(registerAdminFailure).toHaveBeenCalledTimes(1);
    expect(verifyTotpCode).not.toHaveBeenCalled();
  });

  test("POST succeeds with valid credentials and sets cookie", async () => {
    const req = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "pass" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(signAdminToken).toHaveBeenCalledTimes(1);
    expect(cookieSetMock).toHaveBeenCalledWith(
      "admin_session",
      "token",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
      })
    );
    expect(clearAdminFailureState).toHaveBeenCalledTimes(1);
  });

  test("POST validates TOTP when 2FA is enabled", async () => {
    (prisma.adminConfig.findUnique as unknown as jest.Mock).mockResolvedValue({ value: "encrypted" });
    (decrypt as unknown as jest.Mock).mockReturnValue("secret");
    (verifyTotpCode as unknown as jest.Mock).mockReturnValue(true);

    const req = new Request("http://localhost:3000/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "pass", totpCode: "123456" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(decrypt).toHaveBeenCalledWith("encrypted");
    expect(verifyTotpCode).toHaveBeenCalledWith("secret", "123456");
  });

  test("DELETE clears admin_session cookie", async () => {
    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(cookieSetMock).toHaveBeenCalledWith(
      "admin_session",
      "",
      expect.objectContaining({
        maxAge: 0,
        path: "/",
      })
    );
  });
});
