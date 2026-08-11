import type { Availability } from "@shared/schema";

export interface MergedSlot {
  startAt: Date;
  endAt: Date;
}

/**
 * Fusionne les créneaux AVAILABLE qui se touchent ou se chevauchent, pour un
 * affichage lisible (une ligne par plage continue plutôt qu'un créneau brut
 * par ligne). Les UNAVAILABLE ne sont pas affichés côté lecture Senior/Admin —
 * seul ce qui reste disponible compte pour proposer une rencontre.
 */
export function mergeAvailabilities(availabilities: Availability[]): MergedSlot[] {
  const available = availabilities
    .filter((a) => a.kind === "AVAILABLE")
    .map((a) => ({ startAt: new Date(a.startAt), endAt: new Date(a.endAt) }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const merged: MergedSlot[] = [];
  for (const slot of available) {
    const last = merged[merged.length - 1];
    if (last && slot.startAt <= last.endAt) {
      if (slot.endAt > last.endAt) last.endAt = slot.endAt;
    } else {
      merged.push({ ...slot });
    }
  }
  return merged;
}
