/**
 * Formatage des créneaux — ré-export du module partagé.
 * Guadeloupe UTC-4 fixe (voir shared/dates.ts pour le détail du choix).
 */
export { fmtTime, fmtTimeRange, fmtDayShort, fmtDayShortISO, gpParts, gpDecimalHour } from "@shared/dates";

import { gpParts } from "@shared/dates";

export const JOURS_LONGS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/** "Mardi 17/08" — format long utilisé dans la vue relation. */
export function fmtDayLong(date: Date): string {
  const p = gpParts(date);
  return `${JOURS_LONGS[p.dow]} ${p.d}/${String(p.mo + 1).padStart(2, "0")}`;
}
