import { storage } from "../storage";
import { pool } from "../db";
import { closeMeeting } from "./meeting-completion";
import { AUTO_COMPLETE_HOURS } from "../../shared/meeting-check";

/**
 * Identifiant du verrou consultatif Postgres pour ce job — distinct de ceux de
 * feedback-reminder.ts (4_812_357) et meeting-check-reminder.ts (4_812_358) :
 * deux instances en parallèle ne doivent pas clôturer deux fois.
 */
const AUTO_COMPLETE_LOCK_ID = 4_812_359;

/** Lien vers l'onglet admin où l'on contrôle (et corrige) les clôtures. */
export const AUTO_COMPLETE_ADMIN_PATH = "/admin?tab=rencontres";

/**
 * Clôture automatiquement les rencontres CONFIRMED terminées depuis
 * AUTO_COMPLETE_HOURS sans que le senior (ou son aidant) l'ait fait, ni
 * annulé (décision du 2026-11-10). Effets identiques à une clôture manuelle
 * (closeMeeting) : débit du crédit, demande d'avis aux deux participants.
 *
 * Contrôle FEVES : une notification récapitulative par admin et par passe
 * (pas d'e-mail : c'est une information, pas une action à faire). Une
 * clôture à tort se corrige depuis l'onglet Rencontres (« N'a pas eu lieu »),
 * qui rend le crédit.
 *
 * Retourne le nombre de rencontres clôturées (pour les tests).
 */
export async function checkAndAutoCompleteMeetings(now: Date = new Date()): Promise<number> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [AUTO_COMPLETE_LOCK_ID]
    );
    lockAcquired = rows[0]?.locked === true;
    if (!lockAcquired) {
      console.log("[AUTO-COMPLETE] Job déjà en cours sur une autre instance — passe ignorée.");
      return 0;
    }

    const due = await storage.getAutoCompletableInterventions(now);
    let closed = 0;
    for (const intervention of due) {
      try {
        // null = closed meanwhile by the senior/admin: nothing to do.
        if (await closeMeeting(intervention, "AUTO")) closed++;
      } catch (err) {
        // One failure must not block the others; retried on the next pass.
        console.error(`[AUTO-COMPLETE] Échec sur la rencontre ${intervention.id}:`, err);
      }
    }
    if (closed === 0) return 0;

    const admins = await storage.getAdmins();
    for (const admin of admins) {
      await storage.createNotification({
        user: { connect: { id: admin.id } },
        type: "MEETING_CHECK",
        title: "Rencontres clôturées automatiquement",
        message:
          `${closed} rencontre${closed > 1 ? "s" : ""} confirmée${closed > 1 ? "s" : ""} ` +
          `${closed > 1 ? "ont été clôturées" : "a été clôturée"} ${AUTO_COMPLETE_HOURS}h après la fin, ` +
          `sans déclaration du senior. À corriger si l'une n'a pas eu lieu.`,
        link: AUTO_COMPLETE_ADMIN_PATH,
      });
    }
    console.log(`[AUTO-COMPLETE] ${closed} rencontre(s) clôturée(s) automatiquement`);
    return closed;
  } catch (error) {
    console.error("[AUTO-COMPLETE] Erreur:", error);
    return 0;
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [AUTO_COMPLETE_LOCK_ID]);
      } catch (err) {
        console.error("[AUTO-COMPLETE] Échec de libération du verrou:", err);
      }
    }
    client.release();
  }
}
