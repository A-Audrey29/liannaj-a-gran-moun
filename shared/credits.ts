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
 * Who may buy credit offers? Exactly the users who have a balance to act on
 * (creditOwnerId !== null): a senior, and a referent *linked* to a senior.
 * A referent without a linked senior, a junior, an admin or a teacher cannot
 * buy. One rule only, so the buy buttons, /mes-ateliers and the server
 * credit routes always agree. 1 referent = 1 senior (docs/decisions.md).
 */
export function canBuyCredits(
  user: { id: string; role: string; linkedSeniorId?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  return creditOwnerId(user) !== null;
}

/**
 * What to tell a user whose booking was refused with INSUFFICIENT_CREDITS
 * (HTTP 402). The server rule is unchanged; only the wording depends on who
 * is asking. A junior never pays, so is never offered to buy; the "buy"
 * action is offered only to users who can buy (canBuyCredits).
 */
export function insufficientCreditsNotice(
  user: { id: string; role: string; linkedSeniorId?: string | null } | null | undefined,
): { title: string; message: string; canBuy: boolean } {
  const title = "Plus d'atelier disponible";
  if (user?.role === "JUNIOR") {
    return { title, message: "Le senior n'a plus d'atelier disponible.", canBuy: false };
  }
  return { title, message: "Vous n'avez plus d'atelier disponible.", canBuy: canBuyCredits(user) };
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

/**
 * Longest meeting that can still be the free first meeting of a relation
 * (decision 2026-10-12). Shared so the form defaults to a free duration.
 */
export const FREE_FIRST_MEETING_MAX_MINUTES = 30;

/**
 * Length of a workshop when nobody chose one (decision 2026-10-20): form
 * default and server default. The free first meeting keeps its own 30 minutes.
 */
export const DEFAULT_WORKSHOP_MINUTES = 60;

/**
 * Length the request form starts with: the free duration for a first meeting,
 * otherwise the default workshop, never longer than the chosen slot (or the
 * 8 h server maximum).
 */
export function defaultDurationMinutes(isFirst: boolean, slotMinutes?: number): number {
  const base = isFirst ? FREE_FIRST_MEETING_MAX_MINUTES : DEFAULT_WORKSHOP_MINUTES;
  return slotMinutes === undefined ? base : Math.min(base, slotMinutes, 480);
}
