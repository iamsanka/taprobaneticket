import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { orders } from "@/db/schema/orders";
import { finalizeOrder } from "@/lib/orders/finalizeOrder";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;

      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, pi.id));

      if (!order) {
        console.warn(
          `Webhook: no order for payment_intent ${pi.id} — ignoring`
        );
        return NextResponse.json({ received: true });
      }

      const result = await finalizeOrder(order.id);

      if (!result.ok && result.reason === "error") {
        // Return 500 so Stripe retries
        return NextResponse.json(
          { error: "Finalize failed" },
          { status: 500 }
        );
      }
    }
  } catch (err) {
    console.error(`Webhook handler failed:`, err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}