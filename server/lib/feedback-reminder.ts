import { storage } from "../storage";
import { pool } from "../db";
import { sendEmail } from "./email";
import { getFeedbackReminderEmailHtml } from "./email-templates";
import { gpParts, MOIS_LONGS } from "../../shared/dates";
import { PLATFORM_NAME } from "../../shared/branding";
import { getBaseUrl } from "../env";

/**
 * Identifiant du verrou consultatif Postgres pour ce job.
 *
 * Le rappel tourne dans le process web via setInterval. Avec plusieurs
 * instances (scaling horizontal sur Render), chaque instance déclencherait le
 * job en parallèle et chaque utilisateur recevrait le rappel en double.
 *
 * pg_try_advisory_lock est non bloquant : si une autre instance tient déjà le
 * verrou, on repart immédiatement au lieu de faire la queue. Même mécanisme que
 * la protection anti-double-booking dans storage.createInterventionSafe, mais
 * en verrou de session (et non de transaction) car le job dure plusieurs
 * requêtes — d'où la libération explicite dans le finally.
 *
 * Valeur arbitraire mais stable : elle doit seulement être unique parmi les
 * verrous consultatifs de l'application.
 */
const FEEDBACK_REMINDER_LOCK_ID = 4_812_357;

export async function checkAndSendFeedbackReminders() {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [FEEDBACK_REMINDER_LOCK_ID]
    );
    lockAcquired = rows[0]?.locked === true;

    if (!lockAcquired) {
      console.log("[FEEDBACK-REMINDER] Job déjà en cours sur une autre instance — passe ignorée.");
      return;
    }

    const interventions = await storage.getPendingFeedbackForReminder();
    if (interventions.length === 0) return;

    console.log(
      `[FEEDBACK-REMINDER] ${interventions.length} intervention(s) éligible(s) pour relance`
    );
    const baseUrl = getBaseUrl();

    for (const intervention of interventions) {
      const { relation } = intervention;
      // Heure Guadeloupe : le serveur tourne en UTC, une rencontre du soir
      // basculerait au lendemain avec toLocaleDateString.
      const p = gpParts(intervention.scheduledDate);
      const dateStr = `${p.d} ${MOIS_LONGS[p.mo]} ${p.y}`;
      const feedbackUrl = `${baseUrl}/relations/${intervention.relationId}`;
      const subject = `Rappel : donnez votre avis - ${PLATFORM_NAME}`;

      // Une seule tentative par destinataire (décision du 2026-10-12) : la
      // rencontre est marquée relancée même si un e-mail échoue. Rejouer
      // renvoyait le rappel toutes les 6h à celui dont l'e-mail était passé,
      // sans fin si l'autre adresse était invalide. L'échec est journalisé.
      const destinataires: { role: string; email: string; prenom: string }[] = [];
      if (intervention.seniorRating === null) {
        destinataires.push({
          role: "senior",
          email: relation.senior.email,
          prenom: relation.senior.firstName || relation.senior.email,
        });
      }
      if (intervention.juniorRating === null) {
        destinataires.push({
          role: "junior",
          email: relation.junior.email,
          prenom: relation.junior.firstName || relation.junior.email,
        });
      }

      let echecs = 0;
      for (const d of destinataires) {
        try {
          await sendEmail({
            to: d.email,
            subject,
            htmlContent: getFeedbackReminderEmailHtml(d.prenom, dateStr, feedbackUrl),
          });
        } catch (err) {
          echecs++;
          console.error(`[FEEDBACK-REMINDER] Erreur envoi ${d.role} (${d.email}):`, err);
        }
      }

      if (echecs > 0) {
        console.warn(
          `[FEEDBACK-REMINDER] Intervention ${intervention.id} : ${echecs}/${destinataires.length} ` +
            `envoi(s) en échec — non rejoué (une seule tentative).`
        );
      }

      await storage.updateInterventionFeedbackReminderSent(intervention.id);
      console.log(`[FEEDBACK-REMINDER] Relance envoyée pour intervention ${intervention.id}`);
    }
  } catch (error) {
    console.error("[FEEDBACK-REMINDER] Erreur lors de la vérification:", error);
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [FEEDBACK_REMINDER_LOCK_ID]);
      } catch (err) {
        // Sans libération explicite, le verrou tombe à la fermeture de la
        // session — la remise en pool ne suffit pas. On le signale car il
        // bloquerait les passes suivantes sur cette connexion.
        console.error("[FEEDBACK-REMINDER] Échec de libération du verrou:", err);
      }
    }
    client.release();
  }
}
