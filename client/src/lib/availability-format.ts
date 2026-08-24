/**
 * Formatage des créneaux — ré-export du module partagé.
 * Guadeloupe UTC-4 fixe (voir shared/dates.ts pour le détail du choix).
 */
export {
  fmtTime,
  fmtTimeRange,
  fmtDayShort,
  fmtDayShortISO,
  fmtDayLongMonth,
  fmtDayLongMonthYear,
  gpParts,
  gpDecimalHour,
  JOURS_LONGS,
  MOIS_LONGS,
} from "@shared/dates";

import { gpParts, JOURS_LONGS } from "@shared/dates";

/** "Mardi 17/08" — format long utilisé dans la vue relation. */
export function fmtDayLong(date: Date): string {
  const p = gpParts(date);
  return `${JOURS_LONGS[p.dow]} ${p.d}/${String(p.mo + 1).padStart(2, "0")}`;
}
