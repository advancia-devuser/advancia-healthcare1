import { GET, PATCH } from "@/app/api/profile/route";
import { getAuthUser, requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  getAuthUser: jest.fn(),
  requireApprovedUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    wallet: {
      findUnique: jest.fn(),
    },
    walletBalance: {
      findMany: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe("Profile API", () => {
  const authedUser = {
    id: "u1",
    address: "0xabc",
    email: "user@example.com",
    name: "User",
    phone: "+15550000000",
    avatarUrl: "https://example.com/a.png",
    role: "USER",
    status: "APPROVED",
    twoFaSecret: null,
    pin: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthUser as unknown as jest.Mock).mockResolvedValue(authedUser);
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(authedUser);
    (prisma.wallet.findUnique as unknown as jest.Mock).mockResolvedValue({ userId: "u1", chainId: 84532 });
    (prisma.walletBalance.findMany as unknown as jest.Mock).mockResolvedValue([
      { asset: "ETH", balance: "10", updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);
    (prisma.subscription.findFirst as unknown as jest.Mock).mockResolvedValue(null);
    (prisma.user.update as unknown as jest.Mock).mockResolvedValue(authedUser);
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "a1" });
  });

  test("GET returns 401 when unauthorized", async () => {
    (getAuthUser as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/profile");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
  });

  test("GET returns profile payload for authenticated user", async () => {
    const req = new Request("http://localhost:3000/api/profile");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.id).toBe("u1");
    expect(json.wallet.balance).toBe("10");
  });

  test("PATCH returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 for invalid email", async () => {
    const req = new Request("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bad-email" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 400 when no updatable fields are provided", async () => {
    const req = new Request("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("PATCH returns 401 when unauthorized", async () => {
    (requireApprovedUser as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("PATCH normalizes fields and updates profile", async () => {
    (prisma.user.update as unknown as jest.Mock).mockResolvedValue({
      ...authedUser,
      name: "Alice",
      email: "alice@example.com",
      phone: "+15551112222",
      avatarUrl: "https://example.com/avatar.png",
    });

    const req = new Request("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  Alice  ",
        email: "  ALICE@EXAMPLE.COM  ",
        phone: "  +15551112222  ",
        avatarUrl: "  https://example.com/avatar.png  ",
      }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: {
          name: "Alice",
          email: "alice@example.com",
          phone: "+15551112222",
          avatarUrl: "https://example.com/avatar.png",
        },
      })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
