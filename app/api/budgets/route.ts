import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/budgets
 * Returns user's budgets with spending analytics.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApprovedUser(request);

    const budgets = await prisma.budget.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Calculate spending analytics
    const analytics = budgets.map((b) => {
      const limit = BigInt(b.limitAmount);
      const spent = BigInt(b.spentAmount);
      const remaining = limit - spent;
      const percentUsed = limit > BigInt(0) ? Number((spent * BigInt(100)) / limit) : 0;

      return {
        ...b,
        remaining: remaining.toString(),
        percentUsed: Math.min(100, percentUsed),
        isOverBudget: spent > limit,
      };
    });

    // Category summary
    const totalLimit = budgets.reduce((sum, b) => sum + BigInt(b.limitAmount), BigInt(0));
    const totalSpent = budgets.reduce((sum, b) => sum + BigInt(b.spentAmount), BigInt(0));

    return NextResponse.json({
      budgets: analytics,
      summary: {
        totalBudgets: budgets.length,
        totalLimit: totalLimit.toString(),
        totalSpent: totalSpent.toString(),
        totalRemaining: (totalLimit - totalSpent).toString(),
        overallPercentUsed: totalLimit > BigInt(0) ? Number((totalSpent * BigInt(100)) / totalLimit) : 0,
      },
    });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/budgets
 * Body: { name, category, limitAmount, asset?, periodStart?, periodEnd? }
 * Create a new budget.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();

    const { name, category, limitAmount, asset, periodStart, periodEnd } = body;

    if (!name || !category || !limitAmount) {
      return NextResponse.json(
        { error: "name, category, and limitAmount are required" },
        { status: 400 }
      );
    }

    // Default period: current month
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const budget = await prisma.budget.create({
      data: {
        userId: user.id,
        name,
        category,
        limitAmount: String(limitAmount),
        asset: asset || "ETH",
        periodStart: periodStart ? new Date(periodStart) : defaultStart,
        periodEnd: periodEnd ? new Date(periodEnd) : defaultEnd,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "BUDGET_CREATED",
        meta: JSON.stringify({ budgetId: budget.id, name, category, limitAmount }),
      },
    });

    return NextResponse.json({ budget }, { status: 201 });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/budgets
 * Body: { budgetId, limitAmount?, name?, category?, spentAmount? }
 * Update a budget.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const body = await request.json();
    const { budgetId, limitAmount, name, category, spentAmount } = body;

    if (!budgetId) {
      return NextResponse.json({ error: "budgetId is required" }, { status: 400 });
    }

    const existing = await prisma.budget.findFirst({
      where: { id: budgetId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (limitAmount !== undefined) updateData.limitAmount = String(limitAmount);
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (spentAmount !== undefined) updateData.spentAmount = String(spentAmount);

    const budget = await prisma.budget.update({
      where: { id: budgetId },
      data: updateData,
    });

    return NextResponse.json({ budget });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/budgets
 * Body: { budgetId }
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApprovedUser(request);
    const { budgetId } = await request.json();

    if (!budgetId) {
      return NextResponse.json({ error: "budgetId is required" }, { status: 400 });
    }

    await prisma.budget.deleteMany({
      where: { id: budgetId, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
