import { storage } from "../storage";
import { pool } from "../db";
import { sendEmail } from "./email";
import { getAvailabilityEndingEmailHtml } from "./email-templates";
import { fmtDayLongMonth } from "../../shared/dates";
import { PLATFORM_NAME } from "../../shared/branding";
import { isAvailabilityReminderDue } from "../../shared/availability";
import { getBaseUrl } from "../env";

/**
 * Identifiant du verrou consultatif Postgres de ce job, distinct de ceux de
 * feedback-reminder.ts et meeting-check-reminder.ts : même raison d'être,
 * éviter un double envoi si plusieurs instances tournent en parallèle.
 */
const AVAILABILITY_REMINDER_LOCK_ID = 4_812_359;

/** Onglet où le jeune prolonge son planning. */
export const AVAILABILITY_PATH = "/mon-espace?tab=disponibilites";

/**
 * Prévient le jeune que ses créneaux se terminent : ils ne sont générés que
 * pour quelques semaines, et sans créneau plus aucun senior ne peut lui
 * proposer de rencontre. Règle exacte : isAvailabilityReminderDue
 * (shared/availability.ts), une fois par date de fin.
 *
 * Seuls les jeunes qui ont enregistré un planning habituel sont concernés :
 * c'est lui qui permet de prolonger en un clic.
 *
 * Notification d'abord (la garantie), e-mail ensuite en une seule tentative,
 * comme les autres relances.
 */
export async function checkAndSendAvailabilityReminders(now: Date = new Date()) {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [AVAILABILITY_REMINDER_LOCK_ID]
    );
    lockAcquired = rows[0]?.locked === true;
    if (!lockAcquired) {
      console.log("[AVAILABILITY-REMINDER] Job déjà en cours sur une autre instance — passe ignorée.");
      return;
    }

    const juniors = await storage.getJuniorsWithAvailabilityTemplate();
    const due = juniors.filter(
      (j) => j.lastEnd !== null && isAvailabilityReminderDue(j.lastEnd, j.user.availabilityReminderSentAt, now)
    );

    for (const { user, lastEnd } of due) {
      // Last covered day, in Guadeloupe time (a slot ending at midnight
      // belongs to the day before).
      const lastDate = fmtDayLongMonth(new Date(lastEnd!.getTime() - 1));
      const ended = lastEnd!.getTime() <= now.getTime();
      await storage.recordAvailabilityReminder(user.id, {
        title: ended ? "Vos disponibilités sont terminées" : "Vos disponibilités se terminent bientôt",
        message: ended
          ? `Vos derniers créneaux dataient du ${lastDate}. Prolongez votre planning pour que les séniors puissent vous proposer une rencontre.`
          : `Vos créneaux s'arrêtent le ${lastDate}. Prolongez votre planning en un clic pour rester visible.`,
        link: AVAILABILITY_PATH,
      });

      if (!user.email) continue;
      try {
        await sendEmail({
          to: user.email,
          subject: `Vos disponibilités se terminent - ${PLATFORM_NAME}`,
          htmlContent: getAvailabilityEndingEmailHtml(user.firstName, lastDate, `${getBaseUrl()}${AVAILABILITY_PATH}`),
        });
      } catch (err) {
        console.error(`[AVAILABILITY-REMINDER] Échec e-mail à ${user.email} (non rejoué, notification créée):`, err);
      }
    }

    if (due.length > 0) console.log(`[AVAILABILITY-REMINDER] ${due.length} jeune(s) prévenu(s)`);
  } catch (error) {
    console.error("[AVAILABILITY-REMINDER] Erreur lors de la vérification:", error);
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [AVAILABILITY_REMINDER_LOCK_ID]);
      } catch (err) {
        console.error("[AVAILABILITY-REMINDER] Échec de libération du verrou:", err);
      }
    }
    client.release();
  }
}
