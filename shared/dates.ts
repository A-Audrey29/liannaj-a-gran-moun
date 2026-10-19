/**
 * Helpers dates pour le calendrier "Mes disponibilités".
 *
 * Les timestamps prod sont stockés en UTC (TIMESTAMPTZ). L'affichage se fait en
 * heure Guadeloupe : UTC-4 fixe, pas de DST. On dérive donc les composants
 * "wall-clock GP" en décalant de -4h puis en lisant les champs UTC.
 *
 * Les jours sont manipulés comme ISO "YYYY-MM-DD" (date GP, sans heure) pour la
 * navigation semaine/mois.
 *
 * ⚠️ PÉRIMÈTRE : Guadeloupe uniquement.
 * L'offset UTC-4 est FIGÉ (constante GP_OFFSET_MS). Ce code est correct en
 * Guadeloupe (pas de changement d'heure) et FAUX partout où le DST s'applique —
 * France métropolitaine notamment, où les créneaux se décaleraient d'une heure
 * deux fois par an. Toute extension hors Guadeloupe impose de remplacer
 * gpParts / gpDateTimeToUtc par une implémentation à timezone paramétrable
 * (Intl.DateTimeFormat ou date-fns-tz).
 *
 * Pas de `import "server-only"` ici, volontairement : ces helpers sont des
 * fonctions pures (aucun accès DB) partagées entre les mutations serveur et les
 * composants client du calendrier.
 */

const GP_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC-4

const JOURS_COURTS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
export const JOURS_LONGS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];
export const MOIS_LONGS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export interface GPParts {
  y: number;
  mo: number; // 0-based
  d: number;
  h: number;
  mi: number;
  dow: number; // 0=dim … 6=sam
}

/** Composants wall-clock Guadeloupe d'un instant UTC. */
export function gpParts(date: Date): GPParts {
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

/** ISO "YYYY-MM-DD" du jour GP d'un instant UTC. */
export function gpDayISO(date: Date): string {
  const p = gpParts(date);
  return isoFromYMD(p.y, p.mo, p.d);
}

function isoFromYMD(y: number, mo0: number, d: number): string {
  return `${y}-${String(mo0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Composants d'un ISO "YYYY-MM-DD". */
export function partsFromISO(iso: string): { y: number; mo: number; d: number; dow: number } {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { y: 0, mo: 0, d: 0, dow: 0 };
  const y = +m[1];
  const mo = +m[2] - 1;
  const d = +m[3];
  const dow = new Date(Date.UTC(y, mo, d)).getUTCDay();
  return { y, mo, d, dow };
}

/** ISO du jour GP courant. */
export function todayISO(): string {
  return gpDayISO(new Date());
}

/** Ajoute n jours à un ISO "YYYY-MM-DD", renvoie un ISO. */
export function addDaysISO(iso: string, days: number): string {
  const p = partsFromISO(iso);
  const d = new Date(Date.UTC(p.y, p.mo, p.d + days));
  return isoFromYMD(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Lundi de la semaine d'un ISO (renvoie ISO). */
export function startOfWeekISO(iso: string): string {
  const p = partsFromISO(iso);
  const offset = p.dow === 0 ? -6 : 1 - p.dow; // lundi = début
  return addDaysISO(iso, offset);
}

/** Instant UTC correspondant à une date+heure wall-clock GP. */
export function gpDateTimeToUtc(iso: string, hours: number, minutes: number): Date {
  const p = partsFromISO(iso);
  return new Date(Date.UTC(p.y, p.mo, p.d, hours, minutes) + GP_OFFSET_MS);
}

/**
 * Valeur d'un <input type="datetime-local"> ("2026-10-20T09:00") lue comme
 * heure de Guadeloupe, renvoyée en ISO UTC. Ne jamais passer cette valeur à
 * new Date() : le navigateur de l'admin (métropole) la lirait en heure de Paris.
 * Renvoie null si la valeur est incomplète.
 */
export function gpLocalInputToUtcISO(value: string): string | null {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return gpDateTimeToUtc(m[1], +m[2], +m[3]).toISOString();
}

// ─── Formatage ──────────────────────────────────────────────────────────────

/** "Lun. 8 juin" depuis un ISO de jour. */
export function fmtDayShortISO(iso: string): string {
  const p = partsFromISO(iso);
  return `${JOURS_COURTS[p.dow]} ${p.d} ${MOIS[p.mo]}`;
}

/** "Lun. 8 juin" depuis un instant UTC. */
export function fmtDayShort(date: Date): string {
  const p = gpParts(date);
  return `${JOURS_COURTS[p.dow]} ${p.d} ${MOIS[p.mo]}`;
}

/** "mercredi 19 août" depuis un instant UTC. */
export function fmtDayLongMonth(date: Date): string {
  const p = gpParts(date);
  return `${JOURS_LONGS[p.dow].toLowerCase()} ${p.d} ${MOIS_LONGS[p.mo]}`;
}

/** "mercredi 19 août 2026" depuis un instant UTC. */
export function fmtDayLongMonthYear(date: Date): string {
  return `${fmtDayLongMonth(date)} ${gpParts(date).y}`;
}

/** "19/08/2026" (date GP) depuis un instant UTC. Notifications et e-mails. */
export function fmtDayNumeric(date: Date): string {
  const p = gpParts(date);
  return `${String(p.d).padStart(2, "0")}/${String(p.mo + 1).padStart(2, "0")}/${p.y}`;
}

/** "14h00" depuis un instant UTC. */
export function fmtTime(date: Date): string {
  const p = gpParts(date);
  return `${p.h}h${String(p.mi).padStart(2, "0")}`;
}

/** "14h00 – 15h30" entre deux instants UTC. */
export function fmtTimeRange(start: Date, end: Date): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

/** Heure décimale GP d'un instant (ex. 14h30 → 14.5). Pour positionner en grille. */
export function gpDecimalHour(date: Date): number {
  const p = gpParts(date);
  return p.h + p.mi / 60;
}
