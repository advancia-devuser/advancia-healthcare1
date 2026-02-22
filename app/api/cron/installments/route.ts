import { NextResponse } from "next/server";
import { prisma as db } from "@/lib/db";

// This endpoint should be called by a cron job (e.g., Vercel Cron) daily
export async function GET(req: Request) {
  try {
    // Optional: Add a secret key check to prevent unauthorized access
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Find all pending installment payments where the due date is today or earlier
    const duePayments = await db.installmentPayment.findMany({
      where: {
        status: "PENDING",
        dueDate: {
          lte: now,
        },
      },
      include: {
        installment: {
          include: {
            user: {
              include: {
                wallet: true,
              },
            },
          },
        },
      },
    });

    const results = [];

    for (const payment of duePayments) {
      const wallet = payment.installment.user.wallet;
      if (!wallet) {
        results.push({ id: payment.id, status: "failed", reason: "No wallet found" });
        continue;
      }

      const amountDue = Number(payment.amountDue);
      const currentBalance = parseFloat(wallet.balance);

      if (currentBalance >= amountDue) {
        // Process payment
        await db.$transaction(async (tx: any) => {
          // Deduct from wallet
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: (currentBalance - amountDue).toString(),
            },
          });

          // Record transaction
          const transaction = await tx.transaction.create({
            data: {
              userId: payment.installment.userId,
              type: "SEND",
              status: "CONFIRMED",
              amount: amountDue.toString(),
              txHash: `installment-payment-${payment.id}-${Date.now()}`,
              chainId: wallet.chainId,
              to: "SYSTEM",
            },
          });

          // Mark payment as paid
          await tx.installmentPayment.update({
            where: { id: payment.id },
            data: {
              status: "PAID",
              paidAt: new Date(),
              amountPaid: amountDue,
              transactionId: transaction.id,
            },
          });

          // Check if all payments for this installment are paid
          const remainingPayments = await tx.installmentPayment.count({
            where: {
              installmentId: payment.installmentId,
              status: { not: "PAID" },
            },
          });

          if (remainingPayments === 0) {
            await tx.installment.update({
              where: { id: payment.installmentId },
              data: { status: "COMPLETED" },
            });
          } else {
            // Update next due date
            const nextPayment = await tx.installmentPayment.findFirst({
              where: {
                installmentId: payment.installmentId,
                status: "PENDING",
              },
              orderBy: { dueDate: "asc" },
            });

            if (nextPayment) {
              await tx.installment.update({
                where: { id: payment.installmentId },
                data: { nextDueDate: nextPayment.dueDate },
              });
            }
          }
        });

        results.push({ id: payment.id, status: "paid" });
      } else {
        // Insufficient funds
        // Mark as late
        await db.installmentPayment.update({
          where: { id: payment.id },
          data: {
            status: "LATE",
          },
        });

        await db.installment.update({
          where: { id: payment.installmentId },
          data: {
            status: "DEFAULTED",
          },
        });

        results.push({ id: payment.id, status: "failed", reason: "Insufficient funds" });
      }
    }

    return NextResponse.json({
      message: "Processed due installments",
      processedCount: duePayments.length,
      results,
    });
  } catch (error: any) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
