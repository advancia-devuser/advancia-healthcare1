import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendAccountStatusEmail } from "@/lib/email";
import { sendAccountStatusSms } from "@/lib/sms";
import { Prisma, UserStatus } from "@prisma/client";

const USER_STATUS_VALUES = new Set<UserStatus>([
  UserStatus.PENDING,
  UserStatus.APPROVED,
  UserStatus.REJECTED,
  UserStatus.SUSPENDED,
]);

type AdminUserAction = "APPROVE" | "REJECT" | "SUSPEND" | "UNSUSPEND";
type AccountNotificationStatus = "APPROVED" | "REJECTED" | "SUSPENDED" | "RESTORED";

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === "string" && USER_STATUS_VALUES.has(value as UserStatus);
}

function isAdminUserAction(value: unknown): value is AdminUserAction {
  return value === "APPROVE" || value === "REJECT" || value === "SUSPEND" || value === "UNSUSPEND";
}

/**
 * GET /api/admin/users?status=PENDING&search=...&page=1&limit=20
 * Admin: list users with optional filters.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status");
    const candidateStatus = rawStatus ? rawStatus.trim().toUpperCase() : undefined;
    if (candidateStatus && !isUserStatus(candidateStatus)) {
      return NextResponse.json(
        { error: "Invalid status. Allowed values: PENDING, APPROVED, REJECTED, SUSPENDED" },
        { status: 400 }
      );
    }

    const status: UserStatus | undefined =
      candidateStatus && isUserStatus(candidateStatus) ? candidateStatus : undefined;
    const searchValue = searchParams.get("search")?.trim() || undefined;
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const limit = Math.min(100, parsePositiveInt(searchParams.get("limit"), 20));

    const where: Prisma.UserWhereInput = {};
    if (status) where.status = status;
    if (searchValue) {
      where.OR = [
        { address: { contains: searchValue } },
        { email: { contains: searchValue } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { wallet: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, page, limit });
  } catch {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users
 * Body: { userId: string, action: "APPROVE" | "REJECT" | "SUSPEND" | "UNSUSPEND" }
 */
export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { userId, action } = body as { userId?: unknown; action?: unknown };
    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    if (!isAdminUserAction(action)) {
      return NextResponse.json(
        { error: "Invalid action. Allowed values: APPROVE, REJECT, SUSPEND, UNSUSPEND" },
        { status: 400 }
      );
    }

    const statusMap: Record<AdminUserAction, UserStatus> = {
      APPROVE: UserStatus.APPROVED,
      REJECT: UserStatus.REJECTED,
      SUSPEND: UserStatus.SUSPENDED,
      UNSUSPEND: UserStatus.APPROVED,
    };

    const notificationStatusMap: Record<AdminUserAction, AccountNotificationStatus> = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      SUSPEND: "SUSPENDED",
      UNSUSPEND: "RESTORED",
    };

    const newStatus = statusMap[action];
    const notificationStatus = notificationStatusMap[action];

    const user = await prisma.user.update({
      where: { id: userId.trim() },
      data: { status: newStatus },
    });

    // Create notification for the user
    let notificationTitle = "";
    let notificationBody = "";
    
    if (action === "APPROVE") {
      notificationTitle = "Account Approved";
      notificationBody = "Your Advancia Healthcare account has been approved. You can now access all features.";
    } else if (action === "REJECT") {
      notificationTitle = "Account Rejected";
      notificationBody = "Your Advancia Healthcare account application was rejected. Please contact support for more information.";
    } else if (action === "SUSPEND") {
      notificationTitle = "Account Suspended";
      notificationBody = "Your Advancia Healthcare account has been temporarily suspended.";
    } else if (action === "UNSUSPEND") {
      notificationTitle = "Account Restored";
      notificationBody = "Your Advancia Healthcare account has been restored and is active again.";
    }

    if (notificationTitle) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: notificationTitle,
          body: notificationBody,
          channel: "IN_APP",
        }
      });

      // Send email notification if user has an email
      if (user.email) {
        sendAccountStatusEmail(user.email, notificationStatus).catch((err) =>
          console.error("[EMAIL] Failed to send account status email:", err)
        );
      }

      // Send SMS notification if user has a phone number
      if (user.phone) {
        sendAccountStatusSms(user.phone, notificationStatus).catch((err) =>
          console.error("[SMS] Failed to send account status SMS:", err)
        );
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        actor: "ADMIN",
        action: `USER_${action}`,
        meta: JSON.stringify({ newStatus }),
      },
    });

    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
