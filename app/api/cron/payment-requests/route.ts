/**
 * Payment Request Expiry (Cron)
 * ──────────────────────────────
 * Marks PENDING PaymentRequests as EXPIRED when their `expiresAt`
 * has passed, and sends an in-app notification to the requester.
 *
 * Trigger: GET /api/cron/payment-requests
 * Recommended schedule: Every 15 minutes
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = { checked: 0, expired: 0, errors: 0 };

  try {
    const now = new Date();

    const expiredRequests = await prisma.paymentRequest.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lte: now },
      },
      include: {
        user: { select: { id: true, address: true } },
      },
    });

    results.checked = expiredRequests.length;

    for (const req of expiredRequests) {
      try {
        await prisma.$transaction([
          prisma.paymentRequest.update({
            where: { id: req.id },
            data: { status: "EXPIRED" },
          }),
          prisma.notification.create({
            data: {
              userId: req.user.id,
              title: "Payment Request Expired",
              body: `Your payment request for ${req.amount
                ? `${(parseFloat(req.amount) / 1e18).toFixed(6)} ${req.asset}`
                : `(open amount) ${req.asset}`
              }${req.note ? ` — "${req.note}"` : ""} has expired.`,
              channel: "IN_APP",
              meta: JSON.stringify({
                type: "PAYMENT_REQUEST_EXPIRED",
                requestId: req.requestId,
              }),
            },
          }),
        ]);
        results.expired++;
      } catch {
        results.errors++;
      }
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Server error", ...results },
      { status: 500 }
    );
  }
}
