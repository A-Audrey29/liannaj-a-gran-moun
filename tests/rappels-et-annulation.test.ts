/**
 * Annulation par un admin et rappel de feedback.
 *
 * - Un admin qui annule previent le senior ET le jeune (avant : seul le
 *   senior l'etait, le jeune voyait la rencontre disparaitre).
 * - Rappel de feedback : une seule tentative d'e-mail (decision du
 *   2026-10-12). Avant, un e-mail en echec empechait le marquage et le
 *   destinataire servi recevait le rappel toutes les 6h, sans fin.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import { resetDatabase, createUser, loginAs, createRelation } from "./helpers";
import { prisma } from "../server/prisma";
import { sendEmail } from "../server/lib/email";
import { checkAndSendFeedbackReminders } from "../server/lib/feedback-reminder";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(sendEmail).mockReset().mockResolvedValue(null);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

describe("PATCH /api/interventions/:id/cancel par un admin", () => {
  it("previent le senior et le jeune", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const admin = await createUser("ADMIN");
    const relation = await createRelation(senior.id, junior.id);
    const rencontre = await prisma.intervention.create({
      data: { relationId: relation.id, status: "CONFIRMED", scheduledDate: new Date("2026-06-15T14:00:00Z") },
    });

    const res = await (await loginAs(admin)).patch(`/api/interventions/${rencontre.id}/cancel`);

    expect(res.status).toBe(200);
    const notifs = await prisma.notification.findMany({ where: { title: "Intervention annulée" } });
    expect(notifs.map((n) => n.userId).sort()).toEqual([senior.id, junior.id].sort());
  });

  it("quand le senior annule, seul le jeune est prevenu", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id);
    const rencontre = await prisma.intervention.create({
      data: { relationId: relation.id, status: "PROPOSED", scheduledDate: new Date("2026-06-15T14:00:00Z") },
    });

    await (await loginAs(senior)).patch(`/api/interventions/${rencontre.id}/cancel`);

    const notifs = await prisma.notification.findMany({ where: { title: "Intervention annulée" } });
    expect(notifs.map((n) => n.userId)).toEqual([junior.id]);
  });
});

describe("rappel de feedback : une seule tentative", () => {
  it("marque la rencontre relancee meme si un e-mail echoue, et ne rejoue pas", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id);
    const rencontre = await prisma.intervention.create({
      data: {
        relationId: relation.id,
        status: "COMPLETED_PENDING_FEEDBACK",
        scheduledDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });
    vi.mocked(sendEmail).mockImplementation(async ({ to }) => {
      if (to === junior.email) throw new Error("Brevo error (400): invalid email");
      return null;
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    await checkAndSendFeedbackReminders();
    await checkAndSendFeedbackReminders();

    const apres = await prisma.intervention.findUniqueOrThrow({ where: { id: rencontre.id } });
    expect(apres.feedbackReminderSentAt).not.toBeNull();
    // Senior + jeune une fois chacun, rien a la seconde passe.
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("rappel de feedback : panne totale", () => {
  it("si tous les e-mails echouent, la rencontre n'est pas marquee et le rappel repart", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id);
    const rencontre = await prisma.intervention.create({
      data: {
        relationId: relation.id,
        status: "COMPLETED_PENDING_FEEDBACK",
        scheduledDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(sendEmail).mockRejectedValue(new Error("Brevo error (503)"));

    await checkAndSendFeedbackReminders();
    const apresPanne = await prisma.intervention.findUniqueOrThrow({ where: { id: rencontre.id } });
    expect(apresPanne.feedbackReminderSentAt).toBeNull();

    vi.mocked(sendEmail).mockResolvedValue(null);
    await checkAndSendFeedbackReminders();
    const apresRetour = await prisma.intervention.findUniqueOrThrow({ where: { id: rencontre.id } });
    expect(apresRetour.feedbackReminderSentAt).not.toBeNull();
  });
});
