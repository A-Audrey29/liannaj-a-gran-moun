export interface CreditOffer {
  id: string;
  /** Commercial name shown to seniors and referents (provisional, may change). */
  name: string;
  label: string;
  credits: number;
  priceEuros: number;
}

// Prix validés par Audrey le 2026-10-13, encore provisoires (noms aussi).
// Découverte 18 €, Essentiel 85 € (17 €/atelier), Sérénité 160 € (16 €/atelier).
//
// Source de vérité unique pour les prix : lue par le serveur pour créer les
// sessions Stripe Checkout, par la carte d'achat, la page /forfaits ET par
// l'admin (client/src/pages/admin.tsx, onglet Paiements) pour un affichage en
// lecture seule. Aucun écran CRUD — modifier un prix ou ajouter une offre se
// fait ici, suivi d'un redéploiement.
//
// Ne jamais renommer un id existant : le webhook de paiement relit
// metadata.offerId (server/routes.ts) ; un id renommé ferait perdre les
// crédits d'un paiement en cours.
export const CREDIT_OFFERS: readonly CreditOffer[] = [
  { id: "pack-1", name: "Découverte", label: "1 atelier", credits: 1, priceEuros: 18 },
  { id: "pack-5", name: "Essentiel", label: "Pack de 5 ateliers", credits: 5, priceEuros: 85 },
  { id: "pack-10", name: "Sérénité", label: "Pack de 10 ateliers", credits: 10, priceEuros: 160 },
] as const;

export function findCreditOffer(offerId: string): CreditOffer | undefined {
  return CREDIT_OFFERS.find((o) => o.id === offerId);
}
