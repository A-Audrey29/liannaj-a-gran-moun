/**
 * Planning recurrent et exceptions du jeune.
 *
 * - Le planning remplace les creneaux de la fenetre envoyee seulement :
 *   l'ecran annonce « vos N prochaines semaines », les creneaux au-dela
 *   doivent survivre.
 * - Un creneau qui porte une rencontre prevue (PROPOSED comme CONFIRMED)
 *   n'est jamais purge.
 * - Une heure de fin anterieure ou egale au debut est refusee.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs, createRelation } from "./helpers";
import { prisma } from "../server/prisma";

/** Mercredi 4 novembre 2026, dans la fenetre du 2 au 15 novembre. */
const DANS_LA_FENETRE = { startAt: new Date("2026-11-04T13:00:00Z"), endAt: new Date("2026-11-04T16:00:00Z") };
/** 10 decembre 2026 : hors fenetre. */
const HORS_FENETRE = { startAt: new Date("2026-12-10T13:00:00Z"), endAt: new Date("2026-12-10T16:00:00Z") };

const PLANNING_NOVEMBRE = {
  from: "2026-11-02",
  to: "2026-11-15",
  slots: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }],
};

async function creneau(userId: string, c: { startAt: Date; endAt: Date }) {
  return prisma.availability.create({ data: { userId, ...c, kind: "AVAILABLE" } });
}

async function actif(id: string) {
  const a = await prisma.availability.findUniqueOrThrow({ where: { id } });
  return a.deletedAt === null;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/availabilities/recurring", () => {
  it("conserve les creneaux hors de la fenetre envoyee", async () => {
    const junior = await createUser("JUNIOR");
    const decembre = await creneau(junior.id, HORS_FENETRE);

    const res = await (await loginAs(junior)).post("/api/availabilities/recurring").send(PLANNING_NOVEMBRE);

    expect(res.status).toBe(201);
    expect(await actif(decembre.id)).toBe(true);
  });

  it("remplace les creneaux libres de la fenetre", async () => {
    const junior = await createUser("JUNIOR");
    const ancien = await creneau(junior.id, DANS_LA_FENETRE);

    await (await loginAs(junior)).post("/api/availabilities/recurring").send(PLANNING_NOVEMBRE);

    expect(await actif(ancien.id)).toBe(false);
    // Deux lundis dans la fenetre : 2 et 9 novembre.
    expect(await prisma.availability.count({ where: { userId: junior.id, deletedAt: null } })).toBe(2);
  });

  it.each(["PROPOSED", "CONFIRMED"] as const)(
    "ne purge pas un creneau qui porte une rencontre %s",
    async (status) => {
      const junior = await createUser("JUNIOR");
      const senior = await createUser("SENIOR");
      const relation = await createRelation(senior.id, junior.id);
      const occupe = await creneau(junior.id, DANS_LA_FENETRE);
      await prisma.intervention.create({
        data: {
          relationId: relation.id,
          status,
          scheduledDate: new Date("2026-11-04T14:00:00Z"),
          durationMinutes: 60,
        },
      });

      await (await loginAs(junior)).post("/api/availabilities/recurring").send(PLANNING_NOVEMBRE);

      expect(await actif(occupe.id)).toBe(true);
    }
  );

  it.each([
    ["fin avant debut", "14:00", "10:00"],
    ["fin egale au debut", "10:00", "10:00"],
  ])("refuse un creneau %s sans rien purger", async (_cas, startTime, endTime) => {
    const junior = await createUser("JUNIOR");
    const existant = await creneau(junior.id, DANS_LA_FENETRE);

    const res = await (await loginAs(junior))
      .post("/api/availabilities/recurring")
      .send({ ...PLANNING_NOVEMBRE, slots: [{ dayOfWeek: 1, startTime, endTime }] });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(await actif(existant.id)).toBe(true);
  });
});

describe("POST /api/availabilities/exception", () => {
  it("refuse une exception dont la fin precede le debut", async () => {
    const junior = await createUser("JUNIOR");

    const res = await (await loginAs(junior))
      .post("/api/availabilities/exception")
      .send({ date: "2026-11-04", kind: "UNAVAILABLE", startTime: "14:00", endTime: "10:00" });

    expect(res.status).toBe(400);
    expect(await prisma.availability.count()).toBe(0);
  });
});

describe("planning reenregistre avec une rencontre prevue", () => {
  it("ne cree pas de doublon a chaque enregistrement du meme planning", async () => {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");
    const relation = await createRelation(senior.id, junior.id);
    const agent = await loginAs(junior);
    await agent.post("/api/availabilities/recurring").send(PLANNING_NOVEMBRE);
    // Lundi 2 novembre 09:00-12:00 GP = 13:00-16:00 UTC ; rencontre proposee a 14:00 UTC.
    await prisma.intervention.create({
      data: { relationId: relation.id, status: "PROPOSED", scheduledDate: new Date("2026-11-02T14:00:00Z"), durationMinutes: 60 },
    });

    await agent.post("/api/availabilities/recurring").send(PLANNING_NOVEMBRE);
    await agent.post("/api/availabilities/recurring").send(PLANNING_NOVEMBRE);

    expect(await prisma.availability.count({ where: { userId: junior.id, deletedAt: null } })).toBe(2);
  });
});

describe("exception sur une rencontre proposee", () => {
  it("ne retire pas le creneau qui porte une rencontre PROPOSED", async () => {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");
    const relation = await createRelation(senior.id, junior.id);
    const occupe = await creneau(junior.id, DANS_LA_FENETRE);
    await prisma.intervention.create({
      data: { relationId: relation.id, status: "PROPOSED", scheduledDate: new Date("2026-11-04T14:00:00Z"), durationMinutes: 60 },
    });

    const res = await (await loginAs(junior))
      .post("/api/availabilities/exception")
      .send({ date: "2026-11-04", kind: "UNAVAILABLE" });

    expect(res.status).toBeLessThan(300);
    expect(await actif(occupe.id)).toBe(true);
  });
});

describe("exception qui commence pendant une rencontre", () => {
  it("protege une rencontre commencee avant la plage de l'exception", async () => {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");
    const relation = await createRelation(senior.id, junior.id);
    // Creneau 08:00-12:00 GP le 4 novembre ; rencontre 09:00-11:00 GP.
    const creneauMatin = await creneau(junior.id, {
      startAt: new Date("2026-11-04T12:00:00Z"),
      endAt: new Date("2026-11-04T16:00:00Z"),
    });
    await prisma.intervention.create({
      data: { relationId: relation.id, status: "CONFIRMED", scheduledDate: new Date("2026-11-04T13:00:00Z"), durationMinutes: 120 },
    });

    await (await loginAs(junior))
      .post("/api/availabilities/exception")
      .send({ date: "2026-11-04", kind: "UNAVAILABLE", startTime: "10:00", endTime: "12:00" });

    expect(await actif(creneauMatin.id)).toBe(true);
  });
});
