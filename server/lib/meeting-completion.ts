import { storage } from "../storage";
import { sendEmail } from "./email";
import { getFeedbackReminderEmailHtml, getNegativeCreditBalanceEmailHtml } from "./email-templates";
import { fmtDayNumeric } from "../../shared/dates";
import { PLATFORM_NAME } from "../../shared/branding";
import { getBaseUrl } from "../env";
import type { Intervention, Relation } from "../../generated/prisma/client.ts";

/**
 * Clôture d'une rencontre, quel que soit l'auteur : le senior, son aidant,
 * un admin, ou le job de clôture automatique 48h après la fin
 * (décision du 2026-11-10). Une seule fonction pour que les quatre chemins
 * débitent et préviennent exactement de la même façon.
 *
 * Retourne null si la rencontre avait déjà été clôturée ou annulée entre-temps
 * (aucun effet dans ce cas).
 */
export async function closeMeeting(
  intervention: Intervention & { relation: Relation },
  closedBy: { userId: string; isAdmin: boolean } | "AUTO"
): Promise<Intervention | null> {
  const automatic = closedBy === "AUTO";
  const completion = await storage.completeIntervention(
    intervention.id,
    intervention.relation.seniorId,
    automatic ? null : closedBy.userId,
    {
      automatic,
      // Only an admin can close a meeting the junior never confirmed.
      fromStatuses: !automatic && closedBy.isAdmin ? ["PROPOSED", "CONFIRMED"] : ["CONFIRMED"],
    }
  );
  if (!completion) return null;

  if (intervention.relation.status === "PENDING_FIRST_MEETING") {
    await storage.updateRelationStatus(intervention.relationId, "ACTIVE");
    await storage.getOrCreateConversation(intervention.relationId);
  }

  const seniorId = intervention.relation.seniorId;
  const juniorId = intervention.relation.juniorId;
  const relationLink = `/relations/${intervention.relationId}`;

  // Cas rare : solde négatif après un ajustement admin (le blocage réel se
  // fait à la création de toute nouvelle rencontre). On avertit le senior et
  // ses aidants, on ne bloque jamais la clôture.
  const balanceAfter = await storage.getCreditBalance(seniorId);
  if (balanceAfter < 0) {
    const senior = await storage.getUser(seniorId);
    const referents = await storage.getReferentsBySeniorId(seniorId);
    const recipients = [senior, ...referents].filter((u): u is NonNullable<typeof u> => !!u);
    for (const recipient of recipients) {
      await storage.createNotification({
        user: { connect: { id: recipient.id } },
        type: "SYSTEM",
        title: "Solde de crédits négatif",
        message: `Le solde de crédits est de ${balanceAfter}. Un rattrapage est nécessaire pour organiser de nouvelles rencontres.`,
        link: relationLink,
      });
      if (recipient.email && senior) {
        sendEmail({
          to: recipient.email,
          subject: `Solde de crédits négatif — ${PLATFORM_NAME}`,
          htmlContent: getNegativeCreditBalanceEmailHtml(
            `${recipient.firstName} ${recipient.lastName}`,
            `${senior.firstName} ${senior.lastName}`,
            balanceAfter
          ),
        }).catch(console.error);
      }
    }
  }

  // Both participants are asked for their feedback.
  const dateStr = fmtDayNumeric(intervention.scheduledDate);
  for (const userId of [seniorId, juniorId]) {
    await storage.createNotification({
      user: { connect: { id: userId } },
      type: "FEEDBACK_REMINDER",
      title: "Donnez votre avis",
      message: "La rencontre est enregistrée comme réalisée. Merci de laisser votre avis.",
      link: relationLink,
    });
    const user = await storage.getUser(userId);
    if (user?.email) {
      sendEmail({
        to: user.email,
        subject: `${PLATFORM_NAME} - Donnez votre avis sur la rencontre du ${dateStr}`,
        htmlContent: getFeedbackReminderEmailHtml(
          `${user.firstName} ${user.lastName}`,
          dateStr,
          `${getBaseUrl()}${relationLink}`
        ),
      }).catch(console.error);
    }
  }

  return completion.intervention;
}
