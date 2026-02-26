import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return normalizeNonEmptyString(value);
}

function sanitizeIpFromHeaders(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const rawIp = forwardedFor ? forwardedFor.split(",")[0] : realIp;
  const normalized = normalizeOptionalString(rawIp);
  return normalized;
}

/**
 * GET /api/devices
 * Returns user's registered devices/sessions.
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const devices = await prisma.device.findMany({
      where: { userId: user.id },
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        lastActiveAt: true,
        ipAddress: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ devices });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/devices
 * Body: { deviceName, deviceType, fingerprint, userAgent? }
 * Register or update a device.
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { deviceName, deviceType, fingerprint, userAgent } = body as {
      deviceName?: unknown;
      deviceType?: unknown;
      fingerprint?: unknown;
      userAgent?: unknown;
    };

    const normalizedDeviceName = normalizeNonEmptyString(deviceName);
    const normalizedDeviceType = normalizeNonEmptyString(deviceType);
    const normalizedFingerprint = normalizeNonEmptyString(fingerprint);
    const normalizedUserAgent = normalizeOptionalString(userAgent);

    if (!normalizedDeviceName || !normalizedDeviceType || !normalizedFingerprint) {
      return NextResponse.json(
        { error: "deviceName, deviceType, and fingerprint are required" },
        { status: 400 }
      );
    }

    if (normalizedFingerprint.length < 8) {
      return NextResponse.json({ error: "fingerprint must be at least 8 characters" }, { status: 400 });
    }

    // Get IP from headers
    const ip = sanitizeIpFromHeaders(request);

    const device = await prisma.device.upsert({
      where: {
        userId_fingerprint: {
          userId: user.id,
          fingerprint: normalizedFingerprint,
        },
      },
      update: {
        deviceName: normalizedDeviceName,
        lastActiveAt: new Date(),
        ipAddress: ip,
        userAgent: normalizedUserAgent,
        isActive: true,
      },
      create: {
        userId: user.id,
        deviceName: normalizedDeviceName,
        deviceType: normalizedDeviceType,
        fingerprint: normalizedFingerprint,
        ipAddress: ip,
        userAgent: normalizedUserAgent,
      },
    });

    return NextResponse.json({ device }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/devices
 * Body: { deviceId }
 * Revoke a device session.
 */
export async function DELETE(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { deviceId } = body as { deviceId?: unknown };
    const normalizedDeviceId = normalizeNonEmptyString(deviceId);

    if (!normalizedDeviceId) {
      return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
    }

    await prisma.device.updateMany({
      where: { id: normalizedDeviceId, userId: user.id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "DEVICE_REVOKED",
        meta: JSON.stringify({ deviceId: normalizedDeviceId }),
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
