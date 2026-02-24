import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/stats
 * Admin: dashboard statistics.
 */
export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [
      totalUsers,
      pendingApproval,
      approvedUsers,
      suspendedUsers,
      totalTransactions,
      pendingWithdrawals,
      totalCardRequests,
      recentTransactions,
      totalPaymentRequests,
      pendingPaymentRequests,
      paidPaymentRequests,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "PENDING" } }),
      prisma.user.count({ where: { status: "APPROVED" } }),
      prisma.user.count({ where: { status: "SUSPENDED" } }),
      prisma.transaction.count(),
      prisma.withdrawal.count({ where: { status: "PENDING" } }),
      prisma.cardRequest.count(),
      prisma.transaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { user: { select: { address: true, email: true } } },
      }),
      prisma.paymentRequest.count(),
      prisma.paymentRequest.count({ where: { status: "PENDING" } }),
      prisma.paymentRequest.count({ where: { status: "PAID" } }),
    ]);

    return NextResponse.json({
      totalUsers,
      pendingApproval,
      approvedUsers,
      suspendedUsers,
      totalTransactions,
      pendingWithdrawals,
      totalCardRequests,
      recentTransactions,
      paymentRequests: {
        total: totalPaymentRequests,
        pending: pendingPaymentRequests,
        paid: paidPaymentRequests,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
