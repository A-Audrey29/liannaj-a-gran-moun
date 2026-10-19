/**
 * Logique de créneaux partagée client/serveur.
 *
 * Ce module est importé des deux côtés à dessein : si l'UI et le serveur
 * fusionnaient les créneaux différemment, l'UI proposerait des créneaux que le
 * serveur refuserait. Une seule implémentation, une seule vérité.
 *
 * Fonctions pures, aucune dépendance, aucun accès base.
 */

export interface Interval {
  startAt: Date;
  endAt: Date;
}

interface AvailabilityLike {
  startAt: Date | string;
  endAt: Date | string;
  kind: "AVAILABLE" | "UNAVAILABLE";
}

/** Deux intervalles [aStart,aEnd) et [bStart,bEnd) se chevauchent-ils ? */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** L'intervalle [start,end) est-il entièrement contenu dans [outerStart,outerEnd) ? */
export function contains(outerStart: Date, outerEnd: Date, start: Date, end: Date): boolean {
  return outerStart <= start && outerEnd >= end;
}

/**
 * Fusionne les créneaux AVAILABLE qui se touchent ou se chevauchent.
 *
 * Indispensable au-delà de l'affichage : une plage 9h-12h découpée par une
 * exception 10h-11h existe en base comme deux lignes 9h-10h + 11h-12h. Sans
 * fusion, un créneau 9h-10h30 ne serait contenu dans aucune ligne prise
 * isolément — et un créneau 9h30-11h30 ne doit justement PAS passer, car les
 * deux fragments ne sont pas contigus (le trou 10h-11h les sépare).
 */
export function mergeAvailabilities(availabilities: AvailabilityLike[]): Interval[] {
  const available = availabilities
    .filter((a) => a.kind === "AVAILABLE")
    .map((a) => ({ startAt: new Date(a.startAt), endAt: new Date(a.endAt) }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const merged: Interval[] = [];
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

/**
 * Le créneau [start,end) est-il couvert par les disponibilités fournies ?
 *
 * Vrai seulement si un intervalle AVAILABLE fusionné le contient entièrement
 * ET qu'aucun UNAVAILABLE ne le chevauche. L'ordre compte : un UNAVAILABLE
 * posé par-dessus une plage récurrente doit gagner.
 */
export function isSlotCovered(
  availabilities: AvailabilityLike[],
  start: Date,
  end: Date
): boolean {
  const blocked = availabilities
    .filter((a) => a.kind === "UNAVAILABLE")
    .some((a) => overlaps(new Date(a.startAt), new Date(a.endAt), start, end));
  if (blocked) return false;

  return mergeAvailabilities(availabilities).some((m) =>
    contains(m.startAt, m.endAt, start, end)
  );
}

/** Le rappel « vos disponibilités se terminent » part ce nombre de jours avant la fin. */
export const AVAILABILITY_REMINDER_DAYS = 7;

/**
 * Faut-il rappeler au jeune que ses créneaux se terminent ?
 * Oui quand le dernier créneau finit dans moins de AVAILABILITY_REMINDER_DAYS
 * jours (ou est déjà passé), une seule fois par date de fin : un rappel
 * envoyé après le début de la fenêtre de rappel couvre cette date. Prolonger
 * repousse la fin, ce qui rouvre un rappel pour la nouvelle date.
 */
export function isAvailabilityReminderDue(lastEnd: Date, sentAt: Date | null, now: Date): boolean {
  const windowStart = lastEnd.getTime() - AVAILABILITY_REMINDER_DAYS * 24 * 60 * 60 * 1000;
  if (now.getTime() < windowStart) return false;
  return sentAt === null || sentAt.getTime() < windowStart;
}
