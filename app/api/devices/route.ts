import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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

    const body = await request.json();
    const { deviceName, deviceType, fingerprint, userAgent } = body;

    if (!deviceName || !deviceType || !fingerprint) {
      return NextResponse.json(
        { error: "deviceName, deviceType, and fingerprint are required" },
        { status: 400 }
      );
    }

    // Get IP from headers
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;

    const device = await prisma.device.upsert({
      where: {
        userId_fingerprint: {
          userId: user.id,
          fingerprint,
        },
      },
      update: {
        deviceName,
        lastActiveAt: new Date(),
        ipAddress: ip,
        userAgent: userAgent || null,
        isActive: true,
      },
      create: {
        userId: user.id,
        deviceName,
        deviceType,
        fingerprint,
        ipAddress: ip,
        userAgent: userAgent || null,
      },
    });

    return NextResponse.json({ device }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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

    const { deviceId } = await request.json();

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
    }

    await prisma.device.updateMany({
      where: { id: deviceId, userId: user.id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "DEVICE_REVOKED",
        meta: JSON.stringify({ deviceId }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
