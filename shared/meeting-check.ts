/**
 * Clôture des rencontres (décision du 2026-11-10, docs/decisions.md).
 * Processus complet : docs/PROCESSUS-RENCONTRES.md.
 *
 * - Rencontre "terminée" : sa fin (début + durée) est passée. Le senior (ou
 *   son aidant) peut dès lors la déclarer réalisée ; l'admin peut tout faire.
 * - Rencontre CONFIRMED terminée depuis AUTO_COMPLETE_HOURS : clôturée
 *   automatiquement (job meeting-auto-complete), sans action de FEVES.
 * - Rencontre "en retard" : jamais confirmée par le jeune (PROPOSED) et
 *   terminée depuis MEETING_CHECK_GRACE_HOURS. Elle ne peut pas se clôturer
 *   seule : les admins sont relancés (job meeting-check-reminder) et elle
 *   apparaît dans le filtre "À traiter".
 */
export const MEETING_CHECK_GRACE_HOURS = 24;

const GRACE_MS = MEETING_CHECK_GRACE_HOURS * 60 * 60 * 1000;

export const OVERDUE_STATUSES = ["PROPOSED", "CONFIRMED"] as const;

export function meetingEnd(scheduledDate: Date | string, durationMinutes: number): Date {
  return new Date(new Date(scheduledDate).getTime() + durationMinutes * 60 * 1000);
}

type MeetingTiming = { status: string; scheduledDate: Date | string; durationMinutes: number };

const isOpen = (meeting: MeetingTiming) => (OVERDUE_STATUSES as readonly string[]).includes(meeting.status);

/** `now` is required on purpose: passing the function to Array.filter would feed it an index. */
export function isMeetingEnded(meeting: MeetingTiming, now: Date): boolean {
  return isOpen(meeting) && meetingEnd(meeting.scheduledDate, meeting.durationMinutes).getTime() <= now.getTime();
}

export function isMeetingOverdue(meeting: MeetingTiming, now: Date): boolean {
  return (
    meeting.status === "PROPOSED" &&
    meetingEnd(meeting.scheduledDate, meeting.durationMinutes).getTime() + GRACE_MS <= now.getTime()
  );
}

/** Délai après la fin au-delà duquel une rencontre confirmée est clôturée seule. */
export const AUTO_COMPLETE_HOURS = 48;

const AUTO_COMPLETE_MS = AUTO_COMPLETE_HOURS * 60 * 60 * 1000;

export function isMeetingAutoCompletable(meeting: MeetingTiming, now: Date): boolean {
  return (
    meeting.status === "CONFIRMED" &&
    meetingEnd(meeting.scheduledDate, meeting.durationMinutes).getTime() + AUTO_COMPLETE_MS <= now.getTime()
  );
}

/** Borne SQL du job de clôture automatique (même principe que overdueStartBefore). */
export function autoCompleteStartBefore(now: Date): Date {
  return new Date(now.getTime() - AUTO_COMPLETE_MS);
}

/**
 * "Prochaine rencontre" on dashboards: planned (PROPOSED/CONFIRMED) and not
 * finished yet. Based on the end, so a meeting in progress still shows.
 */
export function isUpcomingOrOngoing(meeting: MeetingTiming, now: Date): boolean {
  return isOpen(meeting) && meetingEnd(meeting.scheduledDate, meeting.durationMinutes).getTime() > now.getTime();
}

/**
 * Borne SQL : une rencontre en retard a forcément commencé avant
 * now - délai (la durée est positive). Sert à pré-filtrer en base avant
 * d'appliquer isMeetingOverdue, qui tient compte de la durée.
 */
export function overdueStartBefore(now: Date): Date {
  return new Date(now.getTime() - GRACE_MS);
}
