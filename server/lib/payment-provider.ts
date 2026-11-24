/**
 * Contrat indépendant du prestataire de paiement. Le reste du code (routes,
 * webhook) n'importe jamais de SDK ni d'API de paiement directement —
 * seulement ce contrat. Changer de prestataire = écrire une nouvelle
 * implémentation de PaymentProvider et changer l'export ci-dessous.
 */
export interface CreditCheckoutParams {
  offerId: string;
  offerLabel: string;
  priceEuros: number;
  seniorId: string;
  purchasedByUserId: string;
  /** The provider appends `?payment_id=<id>` so the success page can poll. */
  successUrl: string;
  cancelUrl: string;
  /** null when the server is not reachable from the internet (local dev). */
  webhookUrl: string | null;
}

export interface PurchaseMetadata {
  seniorId: string;
  offerId: string;
  purchasedByUserId: string;
}

/**
 * - paid: money received, credits can be granted.
 * - open: not paid — the payer is still on the payment page, or left it
 *   without paying (the payment expires later on its own).
 * - pending: paid by the payer, being confirmed by the bank (some methods).
 * - failed: will never be paid (cancelled, expired, refused).
 */
export type ProviderPaymentStatus = "paid" | "open" | "pending" | "failed";

export interface ProviderPayment {
  externalId: string;
  status: ProviderPaymentStatus;
  amountPaidEuros: number;
  /** Part of it was refunded or charged back: never credit it. */
  refunded: boolean;
  /** null when the payment was not created by Lyannaj's checkout. */
  metadata: PurchaseMetadata | null;
}

export interface PaymentProvider {
  isConfigured(): boolean;
  createCheckoutSession(params: CreditCheckoutParams): Promise<{ url: string; externalId: string }>;
  /**
   * Reads a payment from the provider's API: the only trusted source for its
   * status and amount. null if the provider does not know this id. Throws on
   * a network / provider error (the caller answers 500 so the webhook retries).
   */
  getPayment(externalId: string): Promise<ProviderPayment | null>;
  /**
   * The payment id a webhook call is about, or null if the body is not a
   * webhook call. Never trusted as is: always re-read with getPayment().
   */
  paymentIdFromWebhook(body: unknown): string | null;
}

export { mollieProvider as paymentProvider } from "./mollie-provider";
