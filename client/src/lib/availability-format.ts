/**
 * Formatage des créneaux de disponibilité pour l'affichage.
 * Guadeloupe UTC-4 fixe (voir server/lib/dates.ts pour le détail du choix).
 */
const GP_OFFSET_MS = 4 * 60 * 60 * 1000;

export const JOURS_LONGS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function gpParts(date: Date) {
  const shifted = new Date(date.getTime() - GP_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
    mi: shifted.getUTCMinutes(),
    dow: shifted.getUTCDay(),
  };
}

export function fmtTime(date: Date): string {
  const p = gpParts(date);
  return `${p.h}h${String(p.mi).padStart(2, "0")}`;
}

export function fmtDayLong(date: Date): string {
  const p = gpParts(date);
  return `${JOURS_LONGS[p.dow]} ${p.d}/${String(p.mo + 1).padStart(2, "0")}`;
}

export function fmtTimeRange(start: Date, end: Date): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}
