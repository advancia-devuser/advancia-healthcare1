import { POST } from "@/app/api/auth/pin/route";
import { requireApprovedUser, checkRateLimitPersistent, getClientIP } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scryptSync } from "crypto";

jest.mock("@/lib/auth", () => ({
  requireApprovedUser: jest.fn(),
  checkRateLimitPersistent: jest.fn(),
  getClientIP: jest.fn(),
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

function hashPin(pin: string): string {
  const salt = "00112233445566778899aabbccddeeff";
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

describe("Auth PIN Route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getClientIP as unknown as jest.Mock).mockReturnValue("127.0.0.1");
    (checkRateLimitPersistent as unknown as jest.Mock).mockResolvedValue(true);
    (prisma.user.update as unknown as jest.Mock).mockResolvedValue({});
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({});
    (prisma.notification.create as unknown as jest.Mock).mockResolvedValue({});
  });

  test("returns 400 for malformed JSON body", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      pin: null,
    });

    const req = new Request("http://localhost:3000/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("returns 400 when action is missing", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      pin: null,
    });

    const req = new Request("http://localhost:3000/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "123456" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid setup pin format", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      pin: null,
    });

    const req = new Request("http://localhost:3000/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup", pin: "12ab" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("returns 400 for non-string currentPin in change action", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      pin: hashPin("123456"),
    });

    const req = new Request("http://localhost:3000/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change", currentPin: 123456, newPin: "654321" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("verifies correct pin", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      pin: hashPin("123456"),
    });

    const req = new Request("http://localhost:3000/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", pin: "123456" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.valid).toBe(true);
  });

  test("returns 401 on incorrect pin verification", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xabc",
      pin: hashPin("123456"),
    });

    const req = new Request("http://localhost:3000/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", pin: "000000" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
