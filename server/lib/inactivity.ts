import { storage } from "../storage";
import { pool } from "../db";
import { sendEmail } from "./email";
import { getInactivityWarningEmailHtml } from "./email-templates";
import { PLATFORM_NAME } from "../../shared/branding";
import { getBaseUrl } from "../env";
import {
  INACTIVITY_GRACE_DAYS,
  INACTIVITY_THRESHOLD_YEARS,
  graceEndsAt,
  inactivityCutoff,
  inactivityStatus,
  type InactiveAccount,
  type InactivityStatus,
} from "../../shared/inactivity";

/**
 * Verrou consultatif Postgres de ce job, distinct de ceux des autres relances
 * (4_812_357 à 4_812_359) : évite un double envoi si deux instances tournent.
 */
const INACTIVITY_LOCK_ID = 4_812_360;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Laisse le serveur finir de démarrer avant la première passe. */
const FIRST_RUN_DELAY_MS = 60 * 1000;

export interface InactivityRunResult {
  /** E-mails envoyés (et comptes marqués) pendant cette passe. */
  warned: number;
  /** Envois en échec : non marqués, ils seront retentés à la prochaine passe. */
  failed: number;
  /** True si une autre instance tenait déjà le verrou. */
  skipped: boolean;
}

/**
 * Avertit par e-mail les comptes sans connexion depuis 2 ans (RGPD).
 *
 * Ce job ne supprime RIEN et ne change aucun statut : après l'e-mail et le
 * délai de grâce, le compte apparaît seulement « à supprimer » dans l'espace
 * admin, où un humain décide. Idempotent : un compte déjà averti est ignoré
 * (jusqu'à ce qu'il se reconnecte, ce qui efface l'avertissement).
 *
 * Un échec d'envoi pour un compte n'arrête pas la passe et ne le marque pas
 * averti : il sera retenté demain.
 */
export async function checkInactiveAccounts(now: Date = new Date()): Promise<InactivityRunResult> {
  const client = await pool.connect();
  let lockAcquired = false;
  const result: InactivityRunResult = { warned: 0, failed: 0, skipped: false };

  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [INACTIVITY_LOCK_ID]
    );
    lockAcquired = rows[0]?.locked === true;
    if (!lockAcquired) {
      console.log("[INACTIVITY] Job déjà en cours sur une autre instance — passe ignorée.");
      result.skipped = true;
      return result;
    }

    const candidates = (await storage.getInactiveUsers(inactivityCutoff(now))).filter(
      (u) => !u.inactivityWarnedAt
    );
    const loginUrl = `${getBaseUrl()}/login`;

    for (const user of candidates) {
      try {
        const sent = await sendEmail({
          to: user.email,
          subject: `Votre compte ${PLATFORM_NAME} est inactif`,
          htmlContent: getInactivityWarningEmailHtml(
            user.firstName || user.email,
            loginUrl,
            INACTIVITY_THRESHOLD_YEARS,
            INACTIVITY_GRACE_DAYS,
            user.household.map((m) => `${m.firstName} ${m.lastName}`.trim())
          ),
        });
        // sendEmail returns null when no e-mail provider is configured: nothing
        // was sent, so do not start the grace period.
        if (!sent) {
          result.failed++;
          continue;
        }
        await storage.markInactivityWarned(user.id, now);
        result.warned++;
      } catch (err) {
        result.failed++;
        console.error(`[INACTIVITY] Échec de l'avertissement pour l'utilisateur ${user.id} (retenté à la prochaine passe):`, err);
      }
    }

    console.log(`[INACTIVITY] ${result.warned} avertissement(s) envoyé(s), ${result.failed} échec(s)`);
    return result;
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [INACTIVITY_LOCK_ID]);
      } catch (err) {
        console.error("[INACTIVITY] Échec de libération du verrou:", err);
      }
    }
    client.release();
  }
}

const STATUS_ORDER: Record<InactivityStatus, number> = { TO_DELETE: 0, WARNED: 1, TO_WARN: 2 };

/** Comptes inactifs depuis 2 ans, pour l'espace admin ; « à supprimer » d'abord. */
export async function listInactiveAccounts(now: Date = new Date()): Promise<InactiveAccount[]> {
  const users = await storage.getInactiveUsers(inactivityCutoff(now));
  return users
    .map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      profilePhoto: u.profilePhoto,
      lastActivityAt: u.lastActivityAt.toISOString(),
      activityVia: u.activityVia,
      warnedAt: u.inactivityWarnedAt?.toISOString() ?? null,
      graceEndsAt: graceEndsAt(u.inactivityWarnedAt)?.toISOString() ?? null,
      status: inactivityStatus(u.inactivityWarnedAt, now),
    }))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.lastActivityAt.localeCompare(b.lastActivityAt)
    );
}

/**
 * Première passe 1 minute après le démarrage, puis toutes les 24 h. Dans le
 * processus (pas de dépendance cron) : si l'hébergeur endort l'instance, la
 * passe a lieu au réveil, avec du retard mais sans perte (le job est idempotent).
 * Désactivable avec INACTIVITY_JOB_ENABLED=false ; jamais lancé en test.
 */
export function startInactivityScheduler(): void {
  if (process.env.NODE_ENV === "test" || process.env.INACTIVITY_JOB_ENABLED === "false") return;
  const run = () => {
    checkInactiveAccounts().catch((err) => console.error("[INACTIVITY] Erreur lors de la vérification:", err));
  };
  setTimeout(run, FIRST_RUN_DELAY_MS).unref();
  setInterval(run, ONE_DAY_MS).unref();
}
