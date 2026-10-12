/**
 * Relance "rencontres a cloturer" (server/lib/meeting-check-reminder.ts).
 *
 * Seul un admin peut marquer une rencontre realisee : ce sont donc les ADMINS
 * qui sont relances, jamais les participants (decision du 2026-10-12, voir
 * docs/PROCESSUS-RENCONTRES.md). Le job tourne toutes les 6h : chaque
 * rencontre en retard n'est signalee qu'une fois, en une notification
 * recapitulative par admin ; un e-mail en echec n'est pas rejoue ; rien ne se
 * passe si une autre instance tient le verrou.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import { resetDatabase, createUser, createRelation } from "./helpers";
import { prisma } from "../server/prisma";
import { pool } from "../server/db";
import { sendEmail } from "../server/lib/email";
import { checkAndSendMeetingCheckReminders, MEETING_CHECK_ADMIN_PATH } from "../server/lib/meeting-check-reminder";
import { isMeetingEnded, isMeetingOverdue } from "../shared/meeting-check";

/** Doit rester egal a MEETING_CHECK_LOCK_ID dans meeting-check-reminder.ts. */
const MEETING_CHECK_LOCK_ID = 4_812_358;

const HEURE = 60 * 60 * 1000;
/** Bien au-dela du delai de 24h apres la fin (duree par defaut : 2h). */
const IL_Y_A_3_JOURS = () => new Date(Date.now() - 3 * 24 * HEURE);
const DEMAIN = () => new Date(Date.now() + 24 * HEURE);

async function relation() {
  const senior = await createUser("SENIOR");
  const junior = await createUser("JUNIOR");
  return { senior, junior, relation: await createRelation(senior.id, junior.id) };
}

async function creerRencontre(
  relationId: string,
  status: "PROPOSED" | "CONFIRMED" | "CANCELLED" | "COMPLETED_PENDING_FEEDBACK" | "COMPLETED",
  scheduledDate: Date,
  meetingCheckReminderSentAt: Date | null = null,
  durationMinutes = 120
) {
  return prisma.intervention.create({
    data: { relationId, status, scheduledDate, meetingCheckReminderSentAt, durationMinutes },
  });
}

function notificationsMeetingCheck() {
  return prisma.notification.findMany({ where: { type: "MEETING_CHECK" } });
}

async function estMarquee(id: string) {
  const i = await prisma.intervention.findUniqueOrThrow({ where: { id } });
  return i.meetingCheckReminderSentAt !== null;
}

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(sendEmail).mockReset().mockResolvedValue(null);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

describe("destinataires : les admins, jamais les participants", () => {
  it("une notification et un e-mail recapitulatifs par admin, rien pour le senior ni le jeune", async () => {
    const adminA = await createUser("ADMIN");
    const adminB = await createUser("ADMIN");
    const r1 = await relation();
    const r2 = await relation();
    await creerRencontre(r1.relation.id, "CONFIRMED", IL_Y_A_3_JOURS());
    await creerRencontre(r2.relation.id, "PROPOSED", IL_Y_A_3_JOURS());

    await checkAndSendMeetingCheckReminders();

    const notifs = await notificationsMeetingCheck();
    expect(notifs.map((n) => n.userId).sort()).toEqual([adminA.id, adminB.id].sort());
    expect(notifs[0].message).toContain("2 rencontres");
    expect(notifs[0].link).toBe(MEETING_CHECK_ADMIN_PATH);

    const destinataires = vi.mocked(sendEmail).mock.calls.map(([arg]) => arg.to).sort();
    expect(destinataires).toEqual([adminA.email, adminB.email].sort());
    const html = vi.mocked(sendEmail).mock.calls[0][0].htmlContent;
    expect(html).toContain(r1.senior.lastName);
    expect(html).toContain(r2.junior.lastName);
  });

  it("n'ecrit pas aux admins suspendus", async () => {
    await createUser("ADMIN", { status: "SUSPENDED" });
    const actif = await createUser("ADMIN");
    const r = await relation();
    await creerRencontre(r.relation.id, "CONFIRMED", IL_Y_A_3_JOURS());

    await checkAndSendMeetingCheckReminders();

    expect((await notificationsMeetingCheck()).map((n) => n.userId)).toEqual([actif.id]);
  });

  it("sans admin actif, ne marque rien pour relancer a la passe suivante", async () => {
    const r = await relation();
    const rencontre = await creerRencontre(r.relation.id, "CONFIRMED", IL_Y_A_3_JOURS());

    await checkAndSendMeetingCheckReminders();

    expect(await estMarquee(rencontre.id)).toBe(false);
    expect(await notificationsMeetingCheck()).toHaveLength(0);
  });
});

describe("selection des rencontres a signaler", () => {
  beforeEach(async () => {
    await createUser("ADMIN");
  });

  it("signale les rencontres PROPOSED ou CONFIRMED en retard et les marque", async () => {
    const r = await relation();
    const proposee = await creerRencontre(r.relation.id, "PROPOSED", IL_Y_A_3_JOURS());
    const confirmee = await creerRencontre(r.relation.id, "CONFIRMED", IL_Y_A_3_JOURS());

    await checkAndSendMeetingCheckReminders();

    expect(await estMarquee(proposee.id)).toBe(true);
    expect(await estMarquee(confirmee.id)).toBe(true);
  });

  it("ignore une rencontre future", async () => {
    const r = await relation();
    await creerRencontre(r.relation.id, "CONFIRMED", DEMAIN());

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each(["CANCELLED", "COMPLETED_PENDING_FEEDBACK", "COMPLETED"] as const)(
    "ignore une rencontre passee deja %s",
    async (status) => {
      const r = await relation();
      await creerRencontre(r.relation.id, status, IL_Y_A_3_JOURS());

      await checkAndSendMeetingCheckReminders();

      expect(await notificationsMeetingCheck()).toHaveLength(0);
    }
  );

  it("ne change jamais le statut de la rencontre : il notifie, il ne decide pas", async () => {
    const r = await relation();
    const rencontre = await creerRencontre(r.relation.id, "CONFIRMED", IL_Y_A_3_JOURS());

    await checkAndSendMeetingCheckReminders();

    const apres = await prisma.intervention.findUniqueOrThrow({ where: { id: rencontre.id } });
    expect(apres.status).toBe("CONFIRMED");
  });
});

describe("delai de 24h apres la fin de la rencontre", () => {
  beforeEach(async () => {
    await createUser("ADMIN");
  });

  /** Rencontre de 2h dont la fin remonte a `heures` heures. */
  const finIlYA = (heures: number) => new Date(Date.now() - (heures + 2) * HEURE);

  it("ignore une rencontre en cours", async () => {
    const r = await relation();
    await creerRencontre(r.relation.id, "CONFIRMED", new Date(Date.now() - HEURE));

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(0);
  });

  it("ignore une rencontre terminee depuis moins de 24h", async () => {
    const r = await relation();
    await creerRencontre(r.relation.id, "CONFIRMED", finIlYA(23));

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(0);
  });

  it("signale une rencontre terminee depuis plus de 24h", async () => {
    const r = await relation();
    await creerRencontre(r.relation.id, "CONFIRMED", finIlYA(25));

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(1);
  });

  it("tient compte de la duree : une rencontre longue commencee il y a 25h n'est pas encore en retard", async () => {
    const r = await relation();
    // 8h de rencontre : fin il y a 17h seulement.
    await creerRencontre(r.relation.id, "CONFIRMED", new Date(Date.now() - 25 * HEURE), null, 480);

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(0);
  });
});

describe("idempotence et echec e-mail", () => {
  it("une seconde passe ne signale pas de nouveau les memes rencontres", async () => {
    await createUser("ADMIN");
    const r = await relation();
    await creerRencontre(r.relation.id, "CONFIRMED", IL_Y_A_3_JOURS());

    await checkAndSendMeetingCheckReminders();
    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("ignore une rencontre deja marquee relancee", async () => {
    await createUser("ADMIN");
    const r = await relation();
    await creerRencontre(r.relation.id, "CONFIRMED", IL_Y_A_3_JOURS(), new Date());

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(0);
  });

  it("un e-mail en echec n'est pas rejoue : notification creee, rencontre marquee, autres admins servis", async () => {
    const enEchec = await createUser("ADMIN");
    const ok = await createUser("ADMIN");
    const r = await relation();
    const rencontre = await creerRencontre(r.relation.id, "CONFIRMED", IL_Y_A_3_JOURS());
    vi.mocked(sendEmail).mockImplementation(async ({ to }) => {
      if (to === enEchec.email) throw new Error("Brevo error (500)");
      return null;
    });

    await checkAndSendMeetingCheckReminders();
    await checkAndSendMeetingCheckReminders();

    expect(await estMarquee(rencontre.id)).toBe(true);
    expect((await notificationsMeetingCheck()).map((n) => n.userId).sort()).toEqual([enEchec.id, ok.id].sort());
    // Une tentative par admin, aucune a la seconde passe.
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

describe("verrou multi-instance", () => {
  it("ne fait rien si une autre instance tient deja le verrou", async () => {
    await createUser("ADMIN");
    const r = await relation();
    const rencontre = await creerRencontre(r.relation.id, "CONFIRMED", IL_Y_A_3_JOURS());

    const autreInstance = await pool.connect();
    try {
      await autreInstance.query("SELECT pg_advisory_lock($1)", [MEETING_CHECK_LOCK_ID]);
      await checkAndSendMeetingCheckReminders();
    } finally {
      await autreInstance.query("SELECT pg_advisory_unlock($1)", [MEETING_CHECK_LOCK_ID]);
      autreInstance.release();
    }

    expect(await estMarquee(rencontre.id)).toBe(false);
    expect(await notificationsMeetingCheck()).toHaveLength(0);
  });

  it("libere le verrou en fin de passe : la passe suivante peut tourner", async () => {
    await createUser("ADMIN");
    const r = await relation();
    await checkAndSendMeetingCheckReminders();
    await creerRencontre(r.relation.id, "CONFIRMED", IL_Y_A_3_JOURS());

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(1);
  });
});

describe("regles partagees avec l'interface admin", () => {
  const maintenant = new Date("2026-10-12T12:00:00Z");
  const debut = new Date("2026-10-11T10:00:00Z"); // fin 12:00 la veille avec 2h

  it("en retard : bascule exactement 24h apres la fin", () => {
    const juste = new Date(maintenant.getTime() - 1);
    expect(isMeetingOverdue({ status: "CONFIRMED", scheduledDate: debut, durationMinutes: 120 }, maintenant)).toBe(true);
    expect(isMeetingOverdue({ status: "CONFIRMED", scheduledDate: debut, durationMinutes: 120 }, juste)).toBe(false);
  });

  it("terminee : des la fin, sans attendre 24h (boutons admin)", () => {
    const finPlus1min = new Date(debut.getTime() + 121 * 60 * 1000);
    const enCours = new Date(debut.getTime() + 60 * 60 * 1000);
    expect(isMeetingEnded({ status: "CONFIRMED", scheduledDate: debut, durationMinutes: 120 }, finPlus1min)).toBe(true);
    expect(isMeetingEnded({ status: "CONFIRMED", scheduledDate: debut, durationMinutes: 120 }, enCours)).toBe(false);
  });

  it("accepte une date ISO (format des entrees d'historique cote client)", () => {
    expect(
      isMeetingOverdue({ status: "PROPOSED", scheduledDate: debut.toISOString(), durationMinutes: 120 }, maintenant)
    ).toBe(true);
  });

  it.each(["CANCELLED", "DONE", "COMPLETED_PENDING_FEEDBACK", "COMPLETED"])(
    "jamais en retard ni terminee-a-cloturer pour le statut %s",
    (status) => {
      expect(isMeetingOverdue({ status, scheduledDate: debut, durationMinutes: 120 }, maintenant)).toBe(false);
      expect(isMeetingEnded({ status, scheduledDate: debut, durationMinutes: 120 }, maintenant)).toBe(false);
    }
  );
});
