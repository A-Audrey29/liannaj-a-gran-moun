/**
 * Un senior ou un aidant « demande un atelier » : le jeune est prevenu par une
 * notification et un e-mail qui parlent d'atelier demande (plus de « rencontre
 * proposee »). Sans duree choisie, l'atelier dure 60 minutes.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import { resetDatabase, createUser, loginAs, createRelation, crediterSenior } from "./helpers";
import { prisma } from "../server/prisma";
import { sendEmail } from "../server/lib/email";

const CRENEAU = new Date("2026-06-15T14:00:00Z");

async function contexte() {
  const junior = await createUser("JUNIOR");
  const senior = await createUser("SENIOR");
  const relation = await createRelation(senior.id, junior.id);
  await prisma.availability.create({
    data: {
      userId: junior.id,
      startAt: new Date("2026-06-15T08:00:00Z"),
      endAt: new Date("2026-06-15T20:00:00Z"),
      kind: "AVAILABLE",
    },
  });
  await crediterSenior(senior.id);
  return { junior, senior, relation };
}

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(sendEmail).mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("demande d'atelier par un senior", () => {
  it("previent le jeune avec le vocabulaire « atelier demande »", async () => {
    const { junior, senior, relation } = await contexte();
    const agent = await loginAs(senior);

    const res = await agent
      .post(`/api/relations/${relation.id}/interventions`)
      .send({ scheduledDate: CRENEAU.toISOString(), durationMinutes: 60, tasks: ["Jardinage"] });
    expect(res.status).toBe(201);

    const notif = await prisma.notification.findFirstOrThrow({ where: { userId: junior.id } });
    expect(notif.title).toBe("Atelier demandé");
    expect(notif.message).toMatch(/^Un atelier vous est demandé pour le /);
    expect(notif.message).not.toMatch(/rencontre/i);

    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe(junior.email);
    expect(mail.subject).toContain("Atelier demandé pour le");
    expect(mail.subject).not.toMatch(/rencontre/i);
    expect(mail.htmlContent).toContain("Un atelier vous est demand");
    expect(mail.htmlContent).not.toContain("Nouvelle rencontre");
  });

  it("sans duree choisie, l'atelier dure 60 minutes", async () => {
    const { senior, relation } = await contexte();
    const agent = await loginAs(senior);

    const res = await agent
      .post(`/api/relations/${relation.id}/interventions`)
      .send({ scheduledDate: CRENEAU.toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.durationMinutes).toBe(60);
  });
});

describe("demande d'atelier par un aidant", () => {
  it("previent le jeune au nom de l'aidant", async () => {
    const { junior, senior, relation } = await contexte();
    const aidant = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id, firstName: "Monique", lastName: "Dupont" });
    const agent = await loginAs(aidant);

    const res = await agent
      .post("/api/referent/interventions")
      .send({ relationId: relation.id, scheduledDate: CRENEAU.toISOString(), durationMinutes: 60 });
    expect(res.status).toBe(201);

    const notif = await prisma.notification.findFirstOrThrow({ where: { userId: junior.id } });
    expect(notif.title).toBe("Atelier demandé");
    expect(notif.message).toContain("Monique Dupont");
    expect(notif.message).toContain("demande un atelier le");
    expect(notif.message).not.toMatch(/propose/i);
  });
});
