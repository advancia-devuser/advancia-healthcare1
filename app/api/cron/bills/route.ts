import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { debitWallet } from "@/lib/ledger";

/**
 * POST /api/cron/bills
 * Processes scheduled bill payments that are due.
 * Should be called periodically (e.g., every hour).
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Find scheduled bills that are due
    const dueBills = await prisma.billPayment.findMany({
      where: {
        status: "SCHEDULED",
        scheduledFor: { lte: now },
      },
      include: { user: true },
      take: 50,
    });

    const results = { processed: 0, failed: 0, errors: [] as string[] };

    for (const bill of dueBills) {
      try {
        // Debit wallet
        await debitWallet({
          userId: bill.userId,
          asset: bill.asset,
          amount: bill.amount,
          chainId: 421614,
          type: "SEND",
          status: "CONFIRMED",
          meta: {
            billerName: bill.billerName,
            accountNumber: bill.accountNumber,
            billId: bill.id,
            type: "SCHEDULED_BILL_PAYMENT",
          },
        });

        // Update bill status
        await prisma.billPayment.update({
          where: { id: bill.id },
          data: { status: "PAID", paidAt: new Date() },
        });

        // Notification
        await prisma.notification.create({
          data: {
            userId: bill.userId,
            title: "Scheduled Bill Paid",
            body: `Payment of ${bill.amount} ${bill.asset} to ${bill.billerName} processed`,
            channel: "IN_APP",
            meta: JSON.stringify({ billId: bill.id }),
          },
        });

        results.processed++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Bill ${bill.id}: ${err.message}`);

        // Mark as failed
        await prisma.billPayment.update({
          where: { id: bill.id },
          data: { status: "FAILED" },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      total: dueBills.length,
      ...results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
