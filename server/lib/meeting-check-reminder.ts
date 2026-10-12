import { storage } from "../storage";
import { pool } from "../db";
import { sendEmail } from "./email";
import { getMeetingCheckAdminEmailHtml } from "./email-templates";
import { gpParts, MOIS_LONGS } from "../../shared/dates";
import { PLATFORM_NAME } from "../../shared/branding";
import { MEETING_CHECK_GRACE_HOURS } from "../../shared/meeting-check";
import { getBaseUrl } from "../env";

/**
 * Identifiant du verrou consultatif Postgres pour ce job — distinct de celui
 * de feedback-reminder.ts (4_812_357), même raison d'être : éviter un double
 * envoi si plusieurs instances tournent en parallèle (cf. ce fichier).
 */
const MEETING_CHECK_LOCK_ID = 4_812_358;

/** Lien direct vers l'onglet admin où l'on clôture les rencontres. */
export const MEETING_CHECK_ADMIN_PATH = "/admin?tab=rencontres";

/**
 * Relance les ADMINS pour les rencontres terminées depuis plus de 24h et
 * jamais clôturées (toujours PROPOSED/CONFIRMED). Règle exacte :
 * isMeetingOverdue (shared/meeting-check.ts). Processus côté équipe :
 * docs/PROCESSUS-RENCONTRES.md.
 *
 * Les admins, et non les participants : seul un admin peut marquer une
 * rencontre réalisée (c'est ce qui débite le crédit). Une passe produit UNE
 * notification et UN e-mail récapitulatif par admin, puis marque les
 * rencontres comme relancées (une seule relance par rencontre).
 *
 * E-mail en une seule tentative : la notification dans l'appli est la
 * garantie, l'e-mail un confort. Un échec Brevo est journalisé, pas rejoué
 * (sinon relance toutes les 6h tant que l'adresse est invalide).
 *
 * Ce job notifie, il ne change jamais le statut d'une rencontre.
 */
export async function checkAndSendMeetingCheckReminders() {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [MEETING_CHECK_LOCK_ID]
    );
    lockAcquired = rows[0]?.locked === true;

    if (!lockAcquired) {
      console.log("[MEETING-CHECK] Job déjà en cours sur une autre instance — passe ignorée.");
      return;
    }

    const overdue = await storage.getOverdueInterventionsForReminder();
    if (overdue.length === 0) return;

    const admins = await storage.getAdmins();
    if (admins.length === 0) {
      // Rien de marqué : la relance repartira dès qu'un admin actif existe.
      console.warn(`[MEETING-CHECK] ${overdue.length} rencontre(s) à clôturer mais aucun admin actif à prévenir.`);
      return;
    }

    const meetings = overdue.map((intervention) => {
      const p = gpParts(intervention.scheduledDate);
      return {
        date: `${p.d} ${MOIS_LONGS[p.mo]} ${p.y}`,
        seniorName: `${intervention.relation.senior.firstName} ${intervention.relation.senior.lastName}`,
        juniorName: `${intervention.relation.junior.firstName} ${intervention.relation.junior.lastName}`,
      };
    });
    const n = overdue.length;
    const adminUrl = `${getBaseUrl()}${MEETING_CHECK_ADMIN_PATH}`;

    for (const admin of admins) {
      await storage.createNotification({
        user: { connect: { id: admin.id } },
        type: "MEETING_CHECK",
        title: "Rencontres à clôturer",
        message:
          `${n} rencontre${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""} depuis plus de ` +
          `${MEETING_CHECK_GRACE_HOURS}h ${n > 1 ? "attendent" : "attend"} d'être marquée${n > 1 ? "s" : ""} réalisée${n > 1 ? "s" : ""} ou annulée${n > 1 ? "s" : ""}.`,
        link: MEETING_CHECK_ADMIN_PATH,
      });

      if (!admin.email) continue;
      try {
        await sendEmail({
          to: admin.email,
          subject: `${n} rencontre${n > 1 ? "s" : ""} à clôturer - ${PLATFORM_NAME}`,
          htmlContent: getMeetingCheckAdminEmailHtml(admin.firstName || admin.email, meetings, adminUrl),
        });
      } catch (err) {
        console.error(`[MEETING-CHECK] Échec e-mail à ${admin.email} (non rejoué, notification créée):`, err);
      }
    }

    await storage.markMeetingCheckReminderSent(overdue.map((i) => i.id));
    console.log(`[MEETING-CHECK] ${n} rencontre(s) signalée(s) à ${admins.length} admin(s)`);
  } catch (error) {
    console.error("[MEETING-CHECK] Erreur lors de la vérification:", error);
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [MEETING_CHECK_LOCK_ID]);
      } catch (err) {
        console.error("[MEETING-CHECK] Échec de libération du verrou:", err);
      }
    }
    client.release();
  }
}
