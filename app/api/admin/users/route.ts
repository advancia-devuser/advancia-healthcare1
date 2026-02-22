import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendAccountStatusEmail } from "@/lib/email";
import { sendAccountStatusSms } from "@/lib/sms";

/**
 * GET /api/admin/users?status=PENDING&search=...&page=1&limit=20
 * Admin: list users with optional filters.
 */
export async function GET(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search") || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "20"));

  try {
    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { address: { contains: search } },
        { email: { contains: search } },
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
  } catch (err: any) {
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
    const { userId, action } = await request.json();
    if (!userId || !action) {
      return NextResponse.json(
        { error: "userId and action are required" },
        { status: 400 }
      );
    }

    const statusMap: Record<string, string> = {
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      SUSPEND: "SUSPENDED",
      UNSUSPEND: "APPROVED",
    };

    const newStatus = statusMap[action];
    if (!newStatus) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: newStatus as any },
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
        const emailStatus = action === "UNSUSPEND" ? "RESTORED" : action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "SUSPENDED";
        sendAccountStatusEmail(user.email, emailStatus as any).catch((err) =>
          console.error("[EMAIL] Failed to send account status email:", err)
        );
      }

      // Send SMS notification if user has a phone number
      if (user.phone) {
        const smsStatus = action === "UNSUSPEND" ? "RESTORED" : action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "SUSPENDED";
        sendAccountStatusSms(user.phone, smsStatus as any).catch((err) =>
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
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
