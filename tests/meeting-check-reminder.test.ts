/**
 * Relance "la rencontre a-t-elle eu lieu ?" (server/lib/meeting-check-reminder.ts).
 *
 * Le job tourne toutes les 6h dans le process web : il doit relancer chaque
 * rencontre en retard une seule fois, ne jamais toucher aux rencontres deja
 * cloturees, reessayer si un e-mail echoue, et ne rien faire si une autre
 * instance tient deja le verrou.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import { resetDatabase, createUser, createRelation } from "./helpers";
import { prisma } from "../server/prisma";
import { pool } from "../server/db";
import { sendEmail } from "../server/lib/email";
import { checkAndSendMeetingCheckReminders } from "../server/lib/meeting-check-reminder";

/** Doit rester egal a MEETING_CHECK_LOCK_ID dans meeting-check-reminder.ts. */
const MEETING_CHECK_LOCK_ID = 4_812_358;

const HIER = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
const DEMAIN = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

async function contexte() {
  const senior = await createUser("SENIOR");
  const junior = await createUser("JUNIOR");
  const relation = await createRelation(senior.id, junior.id);
  return { senior, junior, relation };
}

async function creerRencontre(
  relationId: string,
  status: "PROPOSED" | "CONFIRMED" | "CANCELLED" | "COMPLETED_PENDING_FEEDBACK" | "COMPLETED",
  scheduledDate: Date,
  meetingCheckReminderSentAt: Date | null = null
) {
  return prisma.intervention.create({
    data: { relationId, status, scheduledDate, meetingCheckReminderSentAt },
  });
}

function notificationsMeetingCheck() {
  return prisma.notification.findMany({ where: { type: "MEETING_CHECK" } });
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

describe("selection des rencontres a relancer", () => {
  it("relance une rencontre PROPOSED ou CONFIRMED dont la date est passee", async () => {
    const { relation } = await contexte();
    const proposee = await creerRencontre(relation.id, "PROPOSED", HIER());
    const confirmee = await creerRencontre(relation.id, "CONFIRMED", HIER());

    await checkAndSendMeetingCheckReminders();

    for (const { id } of [proposee, confirmee]) {
      const apres = await prisma.intervention.findUniqueOrThrow({ where: { id } });
      expect(apres.meetingCheckReminderSentAt).not.toBeNull();
    }
    // Senior et jeune notifies pour chacune des deux rencontres.
    expect(await notificationsMeetingCheck()).toHaveLength(4);
  });

  it("ne relance pas une rencontre future", async () => {
    const { relation } = await contexte();
    await creerRencontre(relation.id, "CONFIRMED", DEMAIN());

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it.each(["CANCELLED", "COMPLETED_PENDING_FEEDBACK", "COMPLETED"] as const)(
    "ne relance pas une rencontre passee deja %s",
    async (status) => {
      const { relation } = await contexte();
      await creerRencontre(relation.id, status, HIER());

      await checkAndSendMeetingCheckReminders();

      expect(await notificationsMeetingCheck()).toHaveLength(0);
    }
  );

  it("ne change jamais le statut de la rencontre : il notifie, il ne decide pas", async () => {
    const { relation } = await contexte();
    const rencontre = await creerRencontre(relation.id, "CONFIRMED", HIER());

    await checkAndSendMeetingCheckReminders();

    const apres = await prisma.intervention.findUniqueOrThrow({ where: { id: rencontre.id } });
    expect(apres.status).toBe("CONFIRMED");
  });
});

describe("destinataires", () => {
  it("notifie le senior et le jeune, chacun avec le nom de l'autre", async () => {
    const { senior, junior, relation } = await contexte();
    await creerRencontre(relation.id, "CONFIRMED", HIER());

    await checkAndSendMeetingCheckReminders();

    const notifs = await notificationsMeetingCheck();
    const pourSenior = notifs.find((n) => n.userId === senior.id);
    const pourJeune = notifs.find((n) => n.userId === junior.id);
    expect(pourSenior?.message).toContain(junior.lastName);
    expect(pourJeune?.message).toContain(senior.lastName);
    expect(pourSenior?.link).toBe(`/relations/${relation.id}`);

    const destinataires = vi.mocked(sendEmail).mock.calls.map(([arg]) => arg.to).sort();
    expect(destinataires).toEqual([senior.email, junior.email].sort());
  });
});

describe("idempotence", () => {
  it("une seconde passe ne relance pas une rencontre deja relancee", async () => {
    const { relation } = await contexte();
    await creerRencontre(relation.id, "CONFIRMED", HIER());

    await checkAndSendMeetingCheckReminders();
    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("ignore une rencontre deja marquee relancee", async () => {
    const { relation } = await contexte();
    await creerRencontre(relation.id, "CONFIRMED", HIER(), new Date());

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(0);
  });
});

describe("echec d'envoi e-mail", () => {
  it("ne marque pas la rencontre relancee si un e-mail echoue, pour reessayer a la passe suivante", async () => {
    const { junior, relation } = await contexte();
    const rencontre = await creerRencontre(relation.id, "CONFIRMED", HIER());
    vi.mocked(sendEmail).mockImplementation(async ({ to }) => {
      if (to === junior.email) throw new Error("Brevo error (500)");
      return null;
    });

    await checkAndSendMeetingCheckReminders();

    const apres = await prisma.intervention.findUniqueOrThrow({ where: { id: rencontre.id } });
    expect(apres.meetingCheckReminderSentAt).toBeNull();
    // Les notifications in-app sont creees malgre l'echec Brevo.
    expect(await notificationsMeetingCheck()).toHaveLength(2);
  });

  it("un echec sur une rencontre ne bloque pas les autres", async () => {
    const a = await contexte();
    const b = await contexte();
    const enEchec = await creerRencontre(a.relation.id, "CONFIRMED", HIER());
    const ok = await creerRencontre(b.relation.id, "CONFIRMED", HIER());
    vi.mocked(sendEmail).mockImplementation(async ({ to }) => {
      if (to === a.junior.email) throw new Error("Brevo error (500)");
      return null;
    });

    await checkAndSendMeetingCheckReminders();

    const apresEchec = await prisma.intervention.findUniqueOrThrow({ where: { id: enEchec.id } });
    const apresOk = await prisma.intervention.findUniqueOrThrow({ where: { id: ok.id } });
    expect(apresEchec.meetingCheckReminderSentAt).toBeNull();
    expect(apresOk.meetingCheckReminderSentAt).not.toBeNull();
  });
});

describe("verrou multi-instance", () => {
  it("ne fait rien si une autre instance tient deja le verrou", async () => {
    const { relation } = await contexte();
    const rencontre = await creerRencontre(relation.id, "CONFIRMED", HIER());

    const autreInstance = await pool.connect();
    try {
      await autreInstance.query("SELECT pg_advisory_lock($1)", [MEETING_CHECK_LOCK_ID]);
      await checkAndSendMeetingCheckReminders();
    } finally {
      await autreInstance.query("SELECT pg_advisory_unlock($1)", [MEETING_CHECK_LOCK_ID]);
      autreInstance.release();
    }

    const apres = await prisma.intervention.findUniqueOrThrow({ where: { id: rencontre.id } });
    expect(apres.meetingCheckReminderSentAt).toBeNull();
    expect(await notificationsMeetingCheck()).toHaveLength(0);
  });

  it("libere le verrou en fin de passe : la passe suivante peut tourner", async () => {
    const { relation } = await contexte();
    await checkAndSendMeetingCheckReminders();
    await creerRencontre(relation.id, "CONFIRMED", HIER());

    await checkAndSendMeetingCheckReminders();

    expect(await notificationsMeetingCheck()).toHaveLength(2);
  });
});
