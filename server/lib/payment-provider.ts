/**
 * Contrat indépendant du prestataire de paiement. Le reste du code (routes,
 * webhook) n'importe jamais de SDK de paiement directement — seulement ce
 * contrat. Changer de prestataire = écrire une nouvelle implémentation de
 * PaymentProvider et changer l'export ci-dessous, sans toucher au reste.
 */
export interface CreditCheckoutParams {
  offerId: string;
  offerLabel: string;
  priceEuros: number;
  seniorId: string;
  purchasedByUserId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentEvent {
  type: "checkout_completed";
  externalSessionId: string;
  amountPaidEuros: number;
  metadata: { seniorId: string; offerId: string; purchasedByUserId: string };
}

export interface PaymentProvider {
  isConfigured(): boolean;
  createCheckoutSession(params: CreditCheckoutParams): Promise<{ url: string }>;
  /** Retourne null si la vérification échoue ou si l'événement n'est pas pertinent. */
  verifyWebhookAndExtract(rawBody: Buffer, signatureHeader: string | undefined): PaymentEvent | null;
}

export { stripeProvider as paymentProvider } from "./stripe-provider";
