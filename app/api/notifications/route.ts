import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized;
}

/**
 * GET /api/notifications?page=1&limit=20&unread=true
 * Returns user notifications.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInteger(searchParams.get("limit"), 20));
    const unreadOnly = searchParams.get("unread") === "true";

    const where: { userId: string; isRead?: boolean } = { userId: user.id };
    if (unreadOnly) where.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
    ]);

    return NextResponse.json({ notifications, total, unreadCount, page, limit });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications
 * Body: { notificationIds?: string[], markAllRead?: boolean }
 * Mark notifications as read.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { notificationIds, markAllRead } = body as {
      notificationIds?: unknown;
      markAllRead?: unknown;
    };

    const normalizedMarkAllRead = normalizeBoolean(markAllRead);
    const normalizedIds = normalizeStringArray(notificationIds);

    if (normalizedMarkAllRead) {
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true, message: "All notifications marked as read" });
    }

    if (Array.isArray(notificationIds) && normalizedIds && normalizedIds.length > 0) {
      await prisma.notification.updateMany({
        where: {
          id: { in: normalizedIds },
          userId: user.id,
        },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true, marked: normalizedIds.length });
    }

    return NextResponse.json({ error: "Provide notificationIds or markAllRead" }, { status: 400 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications
 * Body: { notificationId }
 * Delete a single notification.
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { notificationId } = body as { notificationId?: unknown };
    const normalizedNotificationId = typeof notificationId === "string" ? notificationId.trim() : "";

    if (!normalizedNotificationId) {
      return NextResponse.json({ error: "notificationId is required" }, { status: 400 });
    }

    await prisma.notification.deleteMany({
      where: { id: normalizedNotificationId, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
