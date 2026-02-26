import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeBigIntString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  return raw;
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, category, limitAmount, asset, periodStart, periodEnd } = body as {
      name?: unknown;
      category?: unknown;
      limitAmount?: unknown;
      asset?: unknown;
      periodStart?: unknown;
      periodEnd?: unknown;
    };

    const normalizedName = normalizeNonEmptyString(name);
    const normalizedCategory = normalizeNonEmptyString(category);
    const normalizedLimitAmount = normalizeBigIntString(limitAmount);
    const normalizedAsset = normalizeNonEmptyString(asset) || "ETH";

    if (!normalizedName || !normalizedCategory || !normalizedLimitAmount) {
      return NextResponse.json(
        { error: "name, category, and limitAmount are required" },
        { status: 400 }
      );
    }

    // Default period: current month
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const parsedPeriodStart = parseOptionalDate(periodStart);
    const parsedPeriodEnd = parseOptionalDate(periodEnd);

    if (periodStart !== undefined && periodStart !== null && !parsedPeriodStart) {
      return NextResponse.json({ error: "periodStart must be a valid date" }, { status: 400 });
    }

    if (periodEnd !== undefined && periodEnd !== null && !parsedPeriodEnd) {
      return NextResponse.json({ error: "periodEnd must be a valid date" }, { status: 400 });
    }

    const effectivePeriodStart = parsedPeriodStart || defaultStart;
    const effectivePeriodEnd = parsedPeriodEnd || defaultEnd;

    if (effectivePeriodEnd < effectivePeriodStart) {
      return NextResponse.json({ error: "periodEnd must be after periodStart" }, { status: 400 });
    }

    const budget = await prisma.budget.create({
      data: {
        userId: user.id,
        name: normalizedName,
        category: normalizedCategory,
        limitAmount: normalizedLimitAmount,
        asset: normalizedAsset,
        periodStart: effectivePeriodStart,
        periodEnd: effectivePeriodEnd,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actor: user.address,
        action: "BUDGET_CREATED",
        meta: JSON.stringify({
          budgetId: budget.id,
          name: normalizedName,
          category: normalizedCategory,
          limitAmount: normalizedLimitAmount,
          asset: normalizedAsset,
        }),
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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { budgetId, limitAmount, name, category, spentAmount } = body as {
      budgetId?: unknown;
      limitAmount?: unknown;
      name?: unknown;
      category?: unknown;
      spentAmount?: unknown;
    };

    const normalizedBudgetId = normalizeNonEmptyString(budgetId);
    const normalizedLimitAmount = limitAmount !== undefined ? normalizeBigIntString(limitAmount) : undefined;
    const normalizedName = name !== undefined ? normalizeNonEmptyString(name) : undefined;
    const normalizedCategory = category !== undefined ? normalizeNonEmptyString(category) : undefined;
    const normalizedSpentAmount = spentAmount !== undefined ? normalizeBigIntString(spentAmount) : undefined;

    if (!normalizedBudgetId) {
      return NextResponse.json({ error: "budgetId is required" }, { status: 400 });
    }

    if (limitAmount !== undefined && normalizedLimitAmount === null) {
      return NextResponse.json({ error: "limitAmount must be a non-negative integer string" }, { status: 400 });
    }

    if (name !== undefined && !normalizedName) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }

    if (category !== undefined && !normalizedCategory) {
      return NextResponse.json({ error: "category cannot be empty" }, { status: 400 });
    }

    if (spentAmount !== undefined && normalizedSpentAmount === null) {
      return NextResponse.json({ error: "spentAmount must be a non-negative integer string" }, { status: 400 });
    }

    const existing = await prisma.budget.findFirst({
      where: { id: normalizedBudgetId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    const updateData: {
      limitAmount?: string;
      name?: string;
      category?: string;
      spentAmount?: string;
    } = {};
    if (typeof normalizedLimitAmount === "string") updateData.limitAmount = normalizedLimitAmount;
    if (typeof normalizedName === "string") updateData.name = normalizedName;
    if (typeof normalizedCategory === "string") updateData.category = normalizedCategory;
    if (typeof normalizedSpentAmount === "string") updateData.spentAmount = normalizedSpentAmount;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "At least one updatable field (limitAmount, name, category, spentAmount) is required" },
        { status: 400 }
      );
    }

    const budget = await prisma.budget.update({
      where: { id: normalizedBudgetId },
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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { budgetId } = body as { budgetId?: unknown };
    const normalizedBudgetId = normalizeNonEmptyString(budgetId);

    if (!normalizedBudgetId) {
      return NextResponse.json({ error: "budgetId is required" }, { status: 400 });
    }

    await prisma.budget.deleteMany({
      where: { id: normalizedBudgetId, userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (res) {
    if (res instanceof Response) return res;
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
