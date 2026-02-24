import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// This is the Webhook that is called by Alchemy when a new transaction is detected
// The payload is a Webhook object from Alchemy
// https://docs.alchemy.com/reference/alchemy-webhooks

/**
 * Handles GET requests to the webhook endpoint.
 * This can be used for simple verification checks.
 */
export async function GET() {
  return NextResponse.json({ message: "Alchemy Webhook endpoint is active." });
}

export async function POST(req: Request) {
  const webhookSecret = process.env.ALCHEMY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("ALCHEMY_WEBHOOK_SECRET is not set");
    return new Response("Internal Server Error", { status: 500 });
  }

  // Get the token from the headers
  const token = req.headers.get("x-alchemy-token");
  if (token !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();

    // Log the webhook payload for inspection
    console.log("Received Alchemy Webhook:", JSON.stringify(body, null, 2));

    // TODO: Process the webhook payload
    // 1. Identify the user associated with the address in the payload
    // 2. Create a notification for the user in the database
    // Example:
    // const { event } = body;
    // if (event && event.activity) {
    //   for (const activity of event.activity) {
    //     const userAddress = activity.fromAddress; // or toAddress
    //     const user = await prisma.user.findUnique({ where: { address: userAddress } });
    //     if (user) {
    //       await prisma.notification.create({
    //         data: {
    //           userId: user.id,
    //           message: `New transaction detected: ${activity.value} ${activity.asset} from ${activity.fromAddress} to ${activity.toAddress}`,
    //           read: false,
    //         },
    //       });
    //     }
    //   }
    // }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response("Error processing webhook", { status: 500 });
  }
}
