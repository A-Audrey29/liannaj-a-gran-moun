import Stripe from "stripe";
import { env } from "../env";
import type { PaymentProvider, CreditCheckoutParams, PaymentEvent } from "./payment-provider";

const client = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

export const stripeProvider: PaymentProvider = {
  isConfigured() {
    return !!client && !!env.STRIPE_WEBHOOK_SECRET;
  },

  async createCheckoutSession(params: CreditCheckoutParams) {
    if (!client) throw new Error("Stripe non configuré");
    const session = await client.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: Math.round(params.priceEuros * 100),
            product_data: { name: params.offerLabel },
          },
          quantity: 1,
        },
      ],
      metadata: {
        seniorId: params.seniorId,
        offerId: params.offerId,
        purchasedByUserId: params.purchasedByUserId,
      },
      // Stripe fills {CHECKOUT_SESSION_ID}: the success page polls
      // /api/credits/checkout-status with it until the webhook has credited.
      success_url: `${params.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: params.cancelUrl,
    });
    if (!session.url) throw new Error("Stripe n'a pas renvoyé d'URL de paiement");
    return { url: session.url };
  },

  verifyWebhookAndExtract(rawBody, signatureHeader): PaymentEvent | null {
    if (!client || !env.STRIPE_WEBHOOK_SECRET || !signatureHeader) return null;
    let event: Stripe.Event;
    try {
      event = client.webhooks.constructEvent(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return null;
    }
    if (event.type !== "checkout.session.completed") return null;
    const session = event.data.object as Stripe.Checkout.Session;
    const { seniorId, offerId, purchasedByUserId } = session.metadata ?? {};
    if (!seniorId || !offerId || !purchasedByUserId) return null;
    return {
      type: "checkout_completed",
      externalSessionId: session.id,
      amountPaidEuros: (session.amount_total ?? 0) / 100,
      metadata: { seniorId, offerId, purchasedByUserId },
    };
  },
};
