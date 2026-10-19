/**
 * Planning habituel mémorisé, prolongation en un clic et rappel de fin
 * (demande d'Audrey du 2026-10-19).
 *
 * Les créneaux datés ne sont générés que pour quelques semaines. Avant : le
 * formulaire revenait vide (tout ressaisir pour prolonger) et rien ne
 * prévenait le jeune, qui disparaissait des propositions sans le savoir.
 *
 * Les dates sont calculées depuis aujourd'hui : la prolongation part du
 * dernier créneau ou d'aujourd'hui.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs, createRelation } from "./helpers";
import { prisma } from "../server/prisma";
import { todayISO, addDaysISO, gpDateTimeToUtc, partsFromISO } from "../shared/dates";
import { isAvailabilityReminderDue, AVAILABILITY_REMINDER_DAYS } from "../shared/availability";
import { checkAndSendAvailabilityReminders, AVAILABILITY_PATH } from "../server/lib/availability-reminder";

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Planning « tous les jours 9h-12h » : chaque jour de la fenêtre a un créneau. */
const TOUS_LES_JOURS = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "09:00", endTime: "12:00" }));

function planning(semaines: number) {
  const from = todayISO();
  return { from, to: addDaysISO(from, semaines * 7 - 1), slots: TOUS_LES_JOURS };
}

async function creneauxActifs(userId: string) {
  return prisma.availability.findMany({
    where: { userId, kind: "AVAILABLE", deletedAt: null },
    orderBy: { startAt: "asc" },
  });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("planning habituel mémorisé", () => {
  it("l'enregistrement du planning le garde et la route le renvoie avec la fin des créneaux", async () => {
    const junior = await createUser("JUNIOR");
    const agent = await loginAs(junior);

    await agent.post("/api/availabilities/recurring").send(planning(2));
    const res = await agent.get("/api/availabilities/template");

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(7);
    // Dernier jour de la fenêtre, 12h en Guadeloupe.
    expect(res.body.lastEndAt).toBe(gpDateTimeToUtc(addDaysISO(todayISO(), 13), 12, 0).toISOString());
  });

  it("ne part pas dans les profils envoyés aux autres utilisateurs", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    await createRelation(senior.id, junior.id, "ACTIVE");
    await (await loginAs(junior)).post("/api/availabilities/recurring").send(planning(2));

    const res = await (await loginAs(senior)).get("/api/relations");

    expect(res.status).toBe(200);
    expect(res.body[0].junior.firstName).toBeDefined();
    expect(res.body[0].junior).not.toHaveProperty("availabilityTemplate");
    expect(res.body[0].junior).not.toHaveProperty("availabilityReminderSentAt");

    // Liste admin : autre fonction de nettoyage (sanitizeUser).
    const admin = await loginAs(await createUser("ADMIN"));
    const users = await admin.get("/api/admin/users");
    const vuParAdmin = users.body.find((u: { id: string }) => u.id === junior.id);
    expect(vuParAdmin.firstName).toBeDefined();
    expect(vuParAdmin).not.toHaveProperty("availabilityTemplate");
  });
});

describe("POST /api/availabilities/extend", () => {
  it("ajoute les semaines après le dernier créneau sans toucher aux existants", async () => {
    const junior = await createUser("JUNIOR");
    const agent = await loginAs(junior);
    await agent.post("/api/availabilities/recurring").send(planning(2));
    const avant = await creneauxActifs(junior.id);

    const res = await agent.post("/api/availabilities/extend").send({ weeks: 4 });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(28);
    expect(res.body.untilISO).toBe(addDaysISO(todayISO(), 6 * 7 - 1));
    const apres = await creneauxActifs(junior.id);
    expect(apres).toHaveLength(avant.length + 28);
    // Les créneaux d'origine sont toujours là (mêmes identifiants).
    const ids = new Set(apres.map((a) => a.id));
    expect(avant.every((a) => ids.has(a.id))).toBe(true);
  });

  it("ne crée pas de créneau sur une absence déclarée", async () => {
    const junior = await createUser("JUNIOR");
    const agent = await loginAs(junior);
    await agent.post("/api/availabilities/recurring").send(planning(1));
    const absent = addDaysISO(todayISO(), 10);
    await prisma.availability.create({
      data: {
        userId: junior.id,
        startAt: gpDateTimeToUtc(absent, 0, 0),
        endAt: gpDateTimeToUtc(addDaysISO(absent, 1), 0, 0),
        kind: "UNAVAILABLE",
      },
    });

    const res = await agent.post("/api/availabilities/extend").send({ weeks: 2 });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(13);
    const ceJourLa = (await creneauxActifs(junior.id)).filter(
      (a) => a.startAt.getTime() === gpDateTimeToUtc(absent, 9, 0).getTime()
    );
    expect(ceJourLa).toHaveLength(0);
  });

  it("repart d'aujourd'hui quand tous les créneaux sont passés", async () => {
    const junior = await createUser("JUNIOR", {
      availabilityTemplate: [{ dayOfWeek: partsFromISO(todayISO()).dow, startTime: "09:00", endTime: "12:00" }],
    });
    const ilYaUnMois = addDaysISO(todayISO(), -30);
    await prisma.availability.create({
      data: { userId: junior.id, startAt: gpDateTimeToUtc(ilYaUnMois, 9, 0), endAt: gpDateTimeToUtc(ilYaUnMois, 12, 0), kind: "AVAILABLE" },
    });

    const res = await (await loginAs(junior)).post("/api/availabilities/extend").send({ weeks: 2 });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    const futurs = (await creneauxActifs(junior.id)).filter((a) => a.startAt > new Date(Date.now() - JOUR_MS));
    expect(futurs[0].startAt.toISOString()).toBe(gpDateTimeToUtc(todayISO(), 9, 0).toISOString());
  });

  it("demande d'abord un planning habituel", async () => {
    const junior = await createUser("JUNIOR");

    const res = await (await loginAs(junior)).post("/api/availabilities/extend").send({ weeks: 4 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NO_TEMPLATE");
  });

  it("s'arrête à 3 mois après aujourd'hui", async () => {
    const junior = await createUser("JUNIOR");
    const agent = await loginAs(junior);
    await agent.post("/api/availabilities/recurring").send(planning(12));

    const premiere = await agent.post("/api/availabilities/extend").send({ weeks: 8 });
    const seconde = await agent.post("/api/availabilities/extend").send({ weeks: 8 });

    expect(premiere.status).toBe(201);
    expect(premiere.body.untilISO).toBe(addDaysISO(todayISO(), 90));
    expect(seconde.status).toBe(400);
    expect(seconde.body.code).toBe("ALREADY_COVERED");
  });

  it("refuse une durée hors des choix proposés et les autres rôles", async () => {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");

    const duree = await (await loginAs(junior)).post("/api/availabilities/extend").send({ weeks: 52 });
    const role = await (await loginAs(senior)).post("/api/availabilities/extend").send({ weeks: 4 });

    expect(duree.status).toBe(400);
    expect(role.status).toBe(403);
  });
});

describe("isAvailabilityReminderDue", () => {
  const fin = new Date("2026-11-20T16:00:00Z");
  const debutFenetre = new Date(fin.getTime() - AVAILABILITY_REMINDER_DAYS * JOUR_MS);

  it("pas avant la fenêtre de rappel", () => {
    expect(isAvailabilityReminderDue(fin, null, new Date(debutFenetre.getTime() - 1))).toBe(false);
  });

  it("dans la fenêtre, une seule fois pour une même date de fin", () => {
    const maintenant = new Date(debutFenetre.getTime() + JOUR_MS);
    expect(isAvailabilityReminderDue(fin, null, maintenant)).toBe(true);
    expect(isAvailabilityReminderDue(fin, maintenant, new Date(maintenant.getTime() + JOUR_MS))).toBe(false);
  });

  it("un rappel ancien (fin précédente) n'empêche pas le suivant", () => {
    const ancienRappel = new Date(debutFenetre.getTime() - 20 * JOUR_MS);
    expect(isAvailabilityReminderDue(fin, ancienRappel, new Date(debutFenetre.getTime() + JOUR_MS))).toBe(true);
  });
});

describe("rappel de fin de disponibilités", () => {
  async function juniorAvecFinDans(jours: number, extra: Record<string, unknown> = {}) {
    const junior = await createUser("JUNIOR", { availabilityTemplate: TOUS_LES_JOURS, ...extra });
    const dernierJour = addDaysISO(todayISO(), jours);
    await prisma.availability.create({
      data: { userId: junior.id, startAt: gpDateTimeToUtc(dernierJour, 9, 0), endAt: gpDateTimeToUtc(dernierJour, 12, 0), kind: "AVAILABLE" },
    });
    return junior;
  }

  function rappels(userId: string) {
    return prisma.notification.findMany({ where: { userId, link: AVAILABILITY_PATH } });
  }

  it("prévient une seule fois le jeune dont les créneaux finissent dans moins de 7 jours", async () => {
    const bientot = await juniorAvecFinDans(3);
    const tranquille = await juniorAvecFinDans(20);

    await checkAndSendAvailabilityReminders();
    await checkAndSendAvailabilityReminders();

    expect(await rappels(bientot.id)).toHaveLength(1);
    expect(await rappels(tranquille.id)).toHaveLength(0);
    const relu = await prisma.user.findUniqueOrThrow({ where: { id: bientot.id } });
    expect(relu.availabilityReminderSentAt).not.toBeNull();
  });

  it("ignore les jeunes sans planning habituel et les comptes non actifs", async () => {
    const sansPlanning = await createUser("JUNIOR");
    const dernierJour = addDaysISO(todayISO(), 3);
    await prisma.availability.create({
      data: { userId: sansPlanning.id, startAt: gpDateTimeToUtc(dernierJour, 9, 0), endAt: gpDateTimeToUtc(dernierJour, 12, 0), kind: "AVAILABLE" },
    });
    const suspendu = await juniorAvecFinDans(3, { status: "SUSPENDED" });

    await checkAndSendAvailabilityReminders();

    expect(await rappels(suspendu.id)).toHaveLength(0);
    expect(await rappels(sansPlanning.id)).toHaveLength(0);
  });
});
