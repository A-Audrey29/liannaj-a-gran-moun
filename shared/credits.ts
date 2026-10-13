/**
 * Whose credits does this user act on? A senior pays for themselves, a
 * referent for the senior they are linked to. Nobody else has a balance
 * (juniors never pay, see docs/decisions.md). Single source for every route
 * that reads or buys credits.
 */
export function creditOwnerId(user: { id: string; role: string; linkedSeniorId?: string | null }): string | null {
  if (user.role === "SENIOR") return user.id;
  if (user.role === "REFERENT_SENIOR" && user.linkedSeniorId) return user.linkedSeniorId;
  return null;
}

/**
 * Who may buy credit offers? A senior (for themselves) and a referent (for
 * their linked senior); every other role has no balance. Single source for
 * the /forfaits buy buttons and the /mes-ateliers page.
 */
export function canBuyCredits(role: string | null | undefined): boolean {
  return role === "SENIOR" || role === "REFERENT_SENIOR";
}

/** Balance as sent to the client: ledger total, and what is left once planned paid meetings are set aside. */
export interface CreditBalanceResponse {
  balance: number;
  available: number;
}

/** A ledger line as shown to seniors and referents (no internal ids). */
export interface CreditHistoryEntry {
  id: string;
  type: "PURCHASE" | "CONSUMPTION" | "ADJUSTMENT";
  amount: number;
  reason: string | null;
  createdAt: string;
}

export interface CheckoutStatusResponse {
  credited: boolean;
}
