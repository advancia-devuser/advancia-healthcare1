import { DELETE, GET, POST } from "@/app/api/devices/route";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  getAuthUser: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  prisma: {
    device: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe("Devices API", () => {
  const authUser = {
    id: "u1",
    address: "0xabc123",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthUser as unknown as jest.Mock).mockResolvedValue(authUser);
  });

  test("GET returns 401 when unauthorized", async () => {
    (getAuthUser as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/devices");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  test("GET returns user devices", async () => {
    (prisma.device.findMany as unknown as jest.Mock).mockResolvedValue([{ id: "d1" }]);

    const req = new Request("http://localhost:3000/api/devices");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  test("GET returns 500 on unexpected errors", async () => {
    (prisma.device.findMany as unknown as jest.Mock).mockRejectedValue(new Error("db down"));

    const req = new Request("http://localhost:3000/api/devices");
    const res = await GET(req);

    expect(res.status).toBe(500);
  });

  test("POST returns 401 when unauthorized", async () => {
    (getAuthUser as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "iPhone", deviceType: "mobile", fingerprint: "fp-12345678" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(prisma.device.upsert).not.toHaveBeenCalled();
  });

  test("POST rejects missing required fields", async () => {
    const req = new Request("http://localhost:3000/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "iPhone" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.device.upsert).not.toHaveBeenCalled();
  });

  test("POST rejects invalid fingerprint", async () => {
    const req = new Request("http://localhost:3000/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "iPhone", deviceType: "mobile", fingerprint: "abc" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.device.upsert).not.toHaveBeenCalled();
  });

  test("POST returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(prisma.device.upsert).not.toHaveBeenCalled();
  });

  test("POST upserts device with normalized values", async () => {
    (prisma.device.upsert as unknown as jest.Mock).mockResolvedValue({ id: "d1" });

    const req = new Request("http://localhost:3000/api/devices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.1.2.3, 10.1.2.4",
      },
      body: JSON.stringify({
        deviceName: "  iPhone  ",
        deviceType: " mobile ",
        fingerprint: "  fp-12345678  ",
        userAgent: "  Safari  ",
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(prisma.device.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_fingerprint: {
            userId: "u1",
            fingerprint: "fp-12345678",
          },
        },
        create: expect.objectContaining({
          deviceName: "iPhone",
          deviceType: "mobile",
          fingerprint: "fp-12345678",
          ipAddress: "10.1.2.3",
          userAgent: "Safari",
        }),
      })
    );
  });

  test("POST returns 500 on unexpected errors", async () => {
    (prisma.device.upsert as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "iPhone", deviceType: "mobile", fingerprint: "fp-12345678" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
  });

  test("DELETE returns 401 when unauthorized", async () => {
    (getAuthUser as unknown as jest.Mock).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "d1" }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(401);
    expect(prisma.device.updateMany).not.toHaveBeenCalled();
  });

  test("DELETE rejects missing deviceId", async () => {
    const req = new Request("http://localhost:3000/api/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.device.updateMany).not.toHaveBeenCalled();
  });

  test("DELETE returns 400 for malformed JSON body", async () => {
    const req = new Request("http://localhost:3000/api/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    const res = await DELETE(req);

    expect(res.status).toBe(400);
    expect(prisma.device.updateMany).not.toHaveBeenCalled();
  });

  test("DELETE deactivates device and writes audit log", async () => {
    (prisma.device.updateMany as unknown as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.auditLog.create as unknown as jest.Mock).mockResolvedValue({ id: "log1" });

    const req = new Request("http://localhost:3000/api/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: " d1 " }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(prisma.device.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1", userId: "u1" }, data: { isActive: false } })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DEVICE_REVOKED" }) })
    );
  });

  test("DELETE returns 500 on unexpected errors", async () => {
    (prisma.device.updateMany as unknown as jest.Mock).mockRejectedValue(new Error("db failure"));

    const req = new Request("http://localhost:3000/api/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "d1" }),
    });

    const res = await DELETE(req);

    expect(res.status).toBe(500);
  });
});
