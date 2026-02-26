import { DELETE, GET, POST } from "@/app/api/auth/session/route";
import {
  checkRateLimitPersistent,
  consumeAuthNonce,
  getClientIP,
  resolveUser,
  signUserToken,
  storeAuthNonce,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyMessage } from "viem";

const cookieSetMock = jest.fn();

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({
    set: cookieSetMock,
  })),
}));

jest.mock("@/lib/auth", () => ({
  resolveUser: jest.fn(),
  signUserToken: jest.fn(),
  checkRateLimitPersistent: jest.fn(),
  getClientIP: jest.fn(),
  storeAuthNonce: jest.fn(),
  consumeAuthNonce: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("viem", () => ({
  verifyMessage: jest.fn(),
}));

describe("Auth Session API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkRateLimitPersistent as unknown as jest.Mock).mockResolvedValue(true);
    (getClientIP as unknown as jest.Mock).mockReturnValue("127.0.0.1");
    (consumeAuthNonce as unknown as jest.Mock).mockResolvedValue("a".repeat(64));
    (verifyMessage as unknown as jest.Mock).mockResolvedValue(true);
    (resolveUser as unknown as jest.Mock).mockResolvedValue({
      id: "u1",
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      email: null,
      name: null,
      status: "APPROVED",
      role: "USER",
    });
    (signUserToken as unknown as jest.Mock).mockResolvedValue("token");
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });
  });

  test("GET rejects invalid address", async () => {
    const req = new Request("http://localhost:3000/api/auth/session?address=bad");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(storeAuthNonce).not.toHaveBeenCalled();
  });

  test("GET returns nonce and stores it", async () => {
    const req = new Request("http://localhost:3000/api/auth/session?address=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.nonce).toBe("string");
    expect(body.nonce).toHaveLength(64);
    expect(storeAuthNonce).toHaveBeenCalledTimes(1);
  });

  test("POST returns 429 when rate limit exceeded", async () => {
    (checkRateLimitPersistent as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(res.status).toBe(429);
  });

  test("POST rejects missing signature and nonce", async () => {
    const req = new Request("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(consumeAuthNonce).not.toHaveBeenCalled();
  });

  test("POST rejects invalid nonce", async () => {
    const req = new Request("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        signature: "0x1234",
        nonce: "short",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(consumeAuthNonce).not.toHaveBeenCalled();
  });

  test("POST returns 401 for mismatched consumed nonce", async () => {
    (consumeAuthNonce as unknown as jest.Mock).mockResolvedValue("b".repeat(64));

    const req = new Request("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        signature: "0x1234",
        nonce: "a".repeat(64),
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(verifyMessage).not.toHaveBeenCalled();
  });

  test("POST returns 401 for invalid signature", async () => {
    (verifyMessage as unknown as jest.Mock).mockResolvedValue(false);

    const req = new Request("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        signature: "0x1234",
        nonce: "a".repeat(64),
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  test("POST creates session and sets cookie", async () => {
    const req = new Request("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "user-agent": "jest-agent" },
      body: JSON.stringify({
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        signature: "0x1234",
        nonce: "a".repeat(64),
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(signUserToken).toHaveBeenCalledWith("u1", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(cookieSetMock).toHaveBeenCalledWith(
      "user_session",
      "token",
      expect.objectContaining({ httpOnly: true, path: "/" })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  test("DELETE clears user session cookie", async () => {
    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(cookieSetMock).toHaveBeenCalledWith(
      "user_session",
      "",
      expect.objectContaining({ maxAge: 0, path: "/" })
    );
  });
});
