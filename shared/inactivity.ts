/**
 * Conservation des données (RGPD) : un compte sans connexion depuis 2 ans reçoit
 * un e-mail d'avertissement ; 30 jours après, il apparaît « à supprimer » dans
 * l'espace admin. La suppression n'est JAMAIS automatique : un humain la fait.
 *
 * Seul endroit où vivent ces deux durées.
 */
export const INACTIVITY_THRESHOLD_YEARS = 2;
export const INACTIVITY_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export type InactivityStatus =
  /** Inactif depuis 2 ans, e-mail pas encore envoyé (prochaine passe du job). */
  | "TO_WARN"
  /** E-mail envoyé, délai de grâce en cours. */
  | "WARNED"
  /** E-mail envoyé et délai dépassé : à supprimer par un admin. */
  | "TO_DELETE";

export interface InactiveAccount {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  profilePhoto: string | null;
  lastActivityAt: string;
  /**
   * Set when the most recent activity of the household is another member's
   * login (the senior's aidant, or the senior of an aidant account), so the
   * admin sees where the date comes from.
   */
  activityVia: HouseholdMember | null;
  warnedAt: string | null;
  graceEndsAt: string | null;
  status: InactivityStatus;
}

/** Date de référence de l'activité : dernière connexion, sinon création du compte. */
export function lastActivityDate(user: { lastLoginAt: Date | null; createdAt: Date }): Date {
  return user.lastLoginAt ?? user.createdAt;
}

export interface HouseholdMember {
  firstName: string;
  lastName: string;
  role: string;
}

/**
 * Un sénior et ses aidants forment un « foyer » : il suffit que l'un d'eux se
 * connecte pour que tous les comptes du foyer restent actifs (l'aidant utilise
 * souvent la plateforme à la place du sénior). Renvoie la date la plus récente
 * du foyer et, si elle vient d'un autre membre, ce membre.
 */
export function householdActivity<M extends HouseholdMember & { lastLoginAt: Date | null; createdAt: Date }>(
  self: { lastLoginAt: Date | null; createdAt: Date },
  others: M[]
): { at: Date; via: HouseholdMember | null } {
  let at = lastActivityDate(self);
  let via: HouseholdMember | null = null;
  for (const m of others) {
    const d = lastActivityDate(m);
    if (d.getTime() > at.getTime()) {
      at = d;
      via = { firstName: m.firstName, lastName: m.lastName, role: m.role };
    }
  }
  return { at, via };
}

/** Date limite : toute activité antérieure à celle-ci est de l'inactivité. */
export function inactivityCutoff(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - INACTIVITY_THRESHOLD_YEARS);
  return d;
}

/** Fin du délai de grâce, ou null si l'avertissement n'est pas parti. */
export function graceEndsAt(warnedAt: Date | null): Date | null {
  return warnedAt ? new Date(warnedAt.getTime() + INACTIVITY_GRACE_DAYS * DAY_MS) : null;
}

/** Statut d'un compte déjà reconnu inactif (≥ 2 ans). */
export function inactivityStatus(warnedAt: Date | null, now: Date = new Date()): InactivityStatus {
  const end = graceEndsAt(warnedAt);
  if (!end) return "TO_WARN";
  return now.getTime() >= end.getTime() ? "TO_DELETE" : "WARNED";
}
