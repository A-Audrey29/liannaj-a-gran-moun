export interface CreditOffer {
  id: string;
  label: string;
  credits: number;
  priceEuros: number;
}

// MVP — prix et quantités provisoires, à ajuster avec le métier.
export const CREDIT_OFFERS: readonly CreditOffer[] = [
  { id: "pack-1", label: "1 crédit — 1 atelier", credits: 1, priceEuros: 15 },
  { id: "pack-5", label: "Pack de 5 crédits — 5 ateliers", credits: 5, priceEuros: 65 },
] as const;

export function findCreditOffer(offerId: string): CreditOffer | undefined {
  return CREDIT_OFFERS.find((o) => o.id === offerId);
}
