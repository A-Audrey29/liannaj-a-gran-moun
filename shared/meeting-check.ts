/**
 * Rencontre "en retard" : sa fin est passée depuis plus de
 * MEETING_CHECK_GRACE_HOURS et personne ne l'a clôturée (toujours PROPOSED ou
 * CONFIRMED). Règle unique pour la relance e-mail (serveur) et le badge
 * "En retard" / filtre "À traiter" (admin).
 *
 * Le délai laisse aux participants le temps de confirmer ou d'annuler
 * eux-mêmes : sans lui, la relance pouvait partir pendant la rencontre.
 */
export const MEETING_CHECK_GRACE_HOURS = 24;

const GRACE_MS = MEETING_CHECK_GRACE_HOURS * 60 * 60 * 1000;

export const OVERDUE_STATUSES = ["PROPOSED", "CONFIRMED"] as const;

export function meetingEnd(scheduledDate: Date | string, durationMinutes: number): Date {
  return new Date(new Date(scheduledDate).getTime() + durationMinutes * 60 * 1000);
}

export function isMeetingOverdue(
  meeting: { status: string; scheduledDate: Date | string; durationMinutes: number },
  now: Date = new Date()
): boolean {
  return (
    (OVERDUE_STATUSES as readonly string[]).includes(meeting.status) &&
    meetingEnd(meeting.scheduledDate, meeting.durationMinutes).getTime() + GRACE_MS <= now.getTime()
  );
}

/**
 * Borne SQL : une rencontre en retard a forcément commencé avant
 * now - délai (la durée est positive). Sert à pré-filtrer en base avant
 * d'appliquer isMeetingOverdue, qui tient compte de la durée.
 */
export function overdueStartBefore(now: Date = new Date()): Date {
  return new Date(now.getTime() - GRACE_MS);
}
