/**
 * Seul un admin peut marquer une rencontre réalisée (c'est ce qui débite le
 * crédit). Processus complet : docs/PROCESSUS-RENCONTRES.md.
 *
 * - Rencontre "terminée" : sa fin (début + durée) est passée. L'admin peut
 *   dès lors la marquer réalisée ou l'annuler.
 * - Rencontre "en retard" : terminée depuis plus de MEETING_CHECK_GRACE_HOURS
 *   et toujours PROPOSED/CONFIRMED. Les admins sont relancés (job
 *   meeting-check-reminder) et elle apparaît dans le filtre "À traiter".
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
    isOpen(meeting) &&
    meetingEnd(meeting.scheduledDate, meeting.durationMinutes).getTime() + GRACE_MS <= now.getTime()
  );
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
