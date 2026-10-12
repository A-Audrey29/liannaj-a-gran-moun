import { storage } from "../storage";
import { pool } from "../db";
import { sendEmail } from "./email";
import { getMeetingCheckEmailHtml } from "./email-templates";
import { gpParts, MOIS_LONGS } from "../../shared/dates";
import { PLATFORM_NAME } from "../../shared/branding";
import { getBaseUrl } from "../env";

/**
 * Identifiant du verrou consultatif Postgres pour ce job — distinct de celui
 * de feedback-reminder.ts (4_812_357), même raison d'être : éviter un double
 * envoi si plusieurs instances tournent en parallèle (cf. ce fichier).
 */
const MEETING_CHECK_LOCK_ID = 4_812_358;

/**
 * Relance "la rencontre a-t-elle eu lieu ?" pour les interventions terminées
 * depuis plus de 24h sans que le statut ait avancé (toujours PROPOSED ou
 * CONFIRMED) — ni confirmée réalisée, ni annulée par personne. Règle exacte :
 * isMeetingOverdue (shared/meeting-check.ts).
 *
 * Volontairement pas de changement de statut automatique ici : seule une
 * action humaine (junior/senior via /confirm /cancel, ou admin via /done
 * /cancel) fait avancer l'intervention. Ce job notifie, il ne décide pas.
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

    const interventions = await storage.getOverdueInterventionsForReminder();
    if (interventions.length === 0) return;

    console.log(`[MEETING-CHECK] ${interventions.length} intervention(s) en retard à relancer`);
    const baseUrl = getBaseUrl();

    for (const intervention of interventions) {
      const { relation } = intervention;
      const p = gpParts(intervention.scheduledDate);
      const dateStr = `${p.d} ${MOIS_LONGS[p.mo]} ${p.y}`;
      const relationUrl = `${baseUrl}/relations/${intervention.relationId}`;

      const destinataires = [
        { user: relation.senior, partner: relation.junior },
        { user: relation.junior, partner: relation.senior },
      ];

      let echecs = 0;
      for (const { user, partner } of destinataires) {
        await storage.createNotification({
          user: { connect: { id: user.id } },
          type: "MEETING_CHECK",
          title: "La rencontre a-t-elle eu lieu ?",
          message: `La rencontre du ${dateStr} avec ${partner.firstName} ${partner.lastName} est passée. Merci de confirmer ou annuler.`,
          link: `/relations/${intervention.relationId}`,
        });

        if (user.email) {
          try {
            await sendEmail({
              to: user.email,
              subject: `La rencontre du ${dateStr} a-t-elle eu lieu ? - ${PLATFORM_NAME}`,
              htmlContent: getMeetingCheckEmailHtml(
                user.firstName || user.email,
                `${partner.firstName} ${partner.lastName}`,
                dateStr,
                relationUrl
              ),
            });
          } catch (err) {
            echecs++;
            console.error(`[MEETING-CHECK] Erreur envoi email à ${user.email}:`, err);
          }
        }
      }

      // Notifications in-app toujours créées même si un email échoue (ne
      // bloque pas sur Brevo) — seul le flag "déjà relancé" est conditionné
      // au succès des emails, même logique que feedback-reminder.ts : sinon
      // un échec Brevo masqué par l'autre envoi empêcherait toute nouvelle
      // tentative à la prochaine passe.
      if (echecs > 0) {
        console.warn(
          `[MEETING-CHECK] Intervention ${intervention.id} : ${echecs}/${destinataires.length} ` +
            `envoi(s) email en échec — non marquée comme relancée, nouvelle tentative à la prochaine passe.`
        );
        continue;
      }

      await storage.updateInterventionMeetingCheckReminderSent(intervention.id);
      console.log(`[MEETING-CHECK] Relance envoyée pour intervention ${intervention.id}`);
    }
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
