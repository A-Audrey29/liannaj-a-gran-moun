/**
 * Mollie implementation of the payment contract (payment-provider.ts).
 *
 * Plain HTTP calls to the Mollie API (like Brevo for e-mails): three calls
 * are needed, no SDK.
 *
 * Mollie webhooks are not signed: they only carry a payment id. Anyone could
 * post a fake one, so the status and amount are always re-read here from the
 * API with our key — never taken from the webhook request.
 */
import { env } from "../env";
import { PLATFORM_NAME } from "../../shared/branding";
import type {
  PaymentProvider,
  CreditCheckoutParams,
  ProviderPayment,
  ProviderPaymentStatus,
  PurchaseMetadata,
} from "./payment-provider";

const API_URL = "https://api.mollie.com/v2";
const TIMEOUT_MS = 10_000;
// Mollie payment ids: "tr_" + letters/digits. Checked before building a URL
// with it, so a crafted id cannot change the API path.
const PAYMENT_ID = /^tr_[A-Za-z0-9]+$/;

interface MolliePayment {
  id: string;
  status: string;
  amount: { currency: string; value: string };
  metadata: unknown;
  _links?: { checkout?: { href: string } };
}

async function mollieFetch(path: string, init: { method: string; body?: unknown }): Promise<Response> {
  if (!env.MOLLIE_API_KEY) throw new Error("Mollie non configuré");
  return fetch(`${API_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.MOLLIE_API_KEY}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function failure(res: Response, action: string): Promise<Error> {
  // Mollie errors are JSON { title, detail }; never contains the API key.
  const text = await res.text().catch(() => "");
  return new Error(`Mollie ${action} : HTTP ${res.status} ${text.slice(0, 300)}`);
}

/** Mollie statuses: open, pending, authorized, paid, canceled, expired, failed. */
function mapStatus(status: string): ProviderPaymentStatus {
  if (status === "paid") return "paid";
  if (status === "canceled" || status === "expired" || status === "failed") return "failed";
  if (status === "open") return "open";
  return "pending";
}

function parseMetadata(metadata: unknown): PurchaseMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const { seniorId, offerId, purchasedByUserId } = metadata as Record<string, unknown>;
  if (typeof seniorId !== "string" || typeof offerId !== "string" || typeof purchasedByUserId !== "string") {
    return null;
  }
  return { seniorId, offerId, purchasedByUserId };
}

export const mollieProvider: PaymentProvider = {
  isConfigured() {
    return !!env.MOLLIE_API_KEY;
  },

  async createCheckoutSession(params: CreditCheckoutParams) {
    const metadata: PurchaseMetadata = {
      seniorId: params.seniorId,
      offerId: params.offerId,
      purchasedByUserId: params.purchasedByUserId,
    };
    const res = await mollieFetch("/payments", {
      method: "POST",
      body: {
        amount: { currency: "EUR", value: params.priceEuros.toFixed(2) },
        description: `${params.offerLabel} — ${PLATFORM_NAME}`,
        redirectUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        ...(params.webhookUrl ? { webhookUrl: params.webhookUrl } : {}),
        metadata,
      },
    });
    if (!res.ok) throw await failure(res, "création du paiement");
    const payment = (await res.json()) as MolliePayment;
    const url = payment._links?.checkout?.href;
    if (!url) throw new Error("Mollie n'a pas renvoyé d'URL de paiement");

    // Mollie does not put the payment id in the return URL (Stripe did), and
    // the id only exists once the payment is created: add it now so the
    // success page can follow this payment. If this fails the purchase still
    // works — the webhook credits it, the page just cannot show it live.
    try {
      const patch = await mollieFetch(`/payments/${payment.id}`, {
        method: "PATCH",
        body: { redirectUrl: `${params.successUrl}?payment_id=${payment.id}` },
      });
      if (!patch.ok) console.error(String(await failure(patch, "ajout de l'id au lien de retour")));
    } catch (err) {
      console.error("[MOLLIE] Ajout de l'id au lien de retour impossible:", err);
    }

    return { url, externalId: payment.id };
  },

  async getPayment(externalId: string): Promise<ProviderPayment | null> {
    if (!PAYMENT_ID.test(externalId)) return null;
    const res = await mollieFetch(`/payments/${externalId}`, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw await failure(res, "lecture du paiement");
    const payment = (await res.json()) as MolliePayment;
    return {
      externalId: payment.id,
      status: mapStatus(payment.status),
      amountPaidEuros: Number(payment.amount.value),
      // Only euro payments created by our checkout carry usable metadata.
      metadata: payment.amount.currency === "EUR" ? parseMetadata(payment.metadata) : null,
    };
  },

  paymentIdFromWebhook(body: unknown): string | null {
    // Mollie posts a form (application/x-www-form-urlencoded): id=tr_xxx
    if (!body || typeof body !== "object") return null;
    const id = (body as Record<string, unknown>).id;
    return typeof id === "string" && PAYMENT_ID.test(id) ? id : null;
  },
};
