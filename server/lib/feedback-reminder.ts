import { storage } from "../storage";
import { sendEmail } from "./email";
import { getFeedbackReminderEmailHtml } from "./email-templates";

function getAppBaseUrl(): string {
  return process.env.REPLIT_DEPLOYMENT_URL
    ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
    : process.env.REPL_SLUG
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : "https://localhost:5000";
}

export async function checkAndSendFeedbackReminders() {
  try {
    const interventions = await storage.getPendingFeedbackForReminder();

    if (interventions.length === 0) return;

    console.log(`[FEEDBACK-REMINDER] ${interventions.length} intervention(s) éligible(s) pour relance`);
    const baseUrl = getAppBaseUrl();

    for (const intervention of interventions) {
      const { relation } = intervention;
      const dateStr = intervention.scheduledDate.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const feedbackUrl = `${baseUrl}/relations/${intervention.relationId}`;

      let anySent = false;

      if (intervention.seniorRating === null) {
        const html = getFeedbackReminderEmailHtml(
          relation.senior.firstName || relation.senior.email,
          dateStr,
          feedbackUrl
        );
        try {
          await sendEmail({
            to: relation.senior.email,
            subject: "Rappel : donnez votre avis - FEVES",
            htmlContent: html,
          });
          anySent = true;
        } catch (err) {
          console.error("[FEEDBACK-REMINDER] Erreur envoi senior:", err);
        }
      }

      if (intervention.juniorRating === null) {
        const html = getFeedbackReminderEmailHtml(
          relation.junior.firstName || relation.junior.email,
          dateStr,
          feedbackUrl
        );
        try {
          await sendEmail({
            to: relation.junior.email,
            subject: "Rappel : donnez votre avis - FEVES",
            htmlContent: html,
          });
          anySent = true;
        } catch (err) {
          console.error("[FEEDBACK-REMINDER] Erreur envoi junior:", err);
        }
      }

      if (anySent) {
        await storage.updateInterventionFeedbackReminderSent(intervention.id);
      }

      console.log(`[FEEDBACK-REMINDER] Relance envoyée pour intervention ${intervention.id}`);
    }
  } catch (error) {
    console.error("[FEEDBACK-REMINDER] Erreur lors de la vérification:", error);
  }
}
