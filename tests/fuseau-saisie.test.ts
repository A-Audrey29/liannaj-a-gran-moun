/**
 * Heure des rencontres saisie par l'admin (métropole) et l'aidant
 * (audit pré-prod du 2026-10-19).
 *
 * Avant : le formulaire envoyait "2026-06-15T09:00" sans fuseau, et le serveur
 * le lisait dans son propre fuseau (UTC sur Render, Paris en dev). Une
 * rencontre saisie à 9h s'affichait 5h en Guadeloupe, ou était refusée comme
 * hors disponibilités.
 *
 * Maintenant : le formulaire convertit en heure de Guadeloupe
 * (gpLocalInputToUtcISO), et le serveur refuse toute date sans fuseau.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs, createRelation } from "./helpers";
import { prisma } from "../server/prisma";
import { gpLocalInputToUtcISO, fmtTime } from "../shared/dates";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("gpLocalInputToUtcISO", () => {
  it("lit la saisie comme une heure de Guadeloupe (UTC-4)", () => {
    expect(gpLocalInputToUtcISO("2026-06-15T09:00")).toBe("2026-06-15T13:00:00.000Z");
  });

  it("change de jour UTC le soir en Guadeloupe", () => {
    expect(gpLocalInputToUtcISO("2026-06-15T21:30")).toBe("2026-06-16T01:30:00.000Z");
  });

  it("refuse une valeur incomplète", () => {
    expect(gpLocalInputToUtcISO("")).toBeNull();
    expect(gpLocalInputToUtcISO("2026-06-15")).toBeNull();
  });

  it("l'heure affichée est celle saisie", () => {
    expect(fmtTime(new Date(gpLocalInputToUtcISO("2026-06-15T09:00")!))).toBe("9h00");
  });
});

describe("1ère rencontre organisée par l'admin", () => {
  async function preparer() {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const admin = await createUser("ADMIN");
    const relation = await createRelation(senior.id, junior.id, "PENDING_FIRST_MEETING");
    // Disponible de 9h à 12h en Guadeloupe.
    await prisma.availability.create({
      data: {
        userId: junior.id,
        startAt: new Date("2026-06-15T13:00:00Z"),
        endAt: new Date("2026-06-15T16:00:00Z"),
        kind: "AVAILABLE",
      },
    });
    return { relation, adminAgent: await loginAs(admin) };
  }

  it("une saisie à 10h en Guadeloupe tombe dans le créneau 9h-12h du jeune", async () => {
    const { relation, adminAgent } = await preparer();

    const res = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send({
      scheduledDate: gpLocalInputToUtcISO("2026-06-15T10:00"),
      durationMinutes: 30,
    });

    expect(res.status).toBe(201);
    expect(fmtTime(new Date(res.body.scheduledDate))).toBe("10h00");
  });

  it("une date sans fuseau est refusée au lieu d'être lue dans le fuseau du serveur", async () => {
    const { relation, adminAgent } = await preparer();
    // Disponible toute la journée : seul le format peut justifier le refus.
    await prisma.availability.updateMany({
      data: { startAt: new Date("2026-06-15T00:00:00Z"), endAt: new Date("2026-06-15T23:59:00Z") },
    });

    const res = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send({
      scheduledDate: "2026-06-15T10:00",
      durationMinutes: 30,
    });

    expect(res.status).toBe(400);
    expect(await prisma.intervention.count()).toBe(0);
  });
});

describe("liste Cadrage de l'admin", () => {
  it("ne liste plus une relation dont la 1ère rencontre est organisée, la reliste si elle est annulée", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const admin = await createUser("ADMIN");
    const relation = await createRelation(senior.id, junior.id, "PENDING_FIRST_MEETING");
    const adminAgent = await loginAs(admin);

    const avant = await adminAgent.get("/api/admin/relations/pending-meeting");
    expect(avant.body.map((r: { id: string }) => r.id)).toEqual([relation.id]);

    const intervention = await prisma.intervention.create({
      data: {
        relationId: relation.id,
        scheduledDate: new Date("2026-06-15T14:00:00Z"),
        durationMinutes: 30,
        status: "CONFIRMED",
      },
    });
    const organisee = await adminAgent.get("/api/admin/relations/pending-meeting");
    expect(organisee.body).toEqual([]);

    await prisma.intervention.update({ where: { id: intervention.id }, data: { status: "CANCELLED" } });
    const annulee = await adminAgent.get("/api/admin/relations/pending-meeting");
    expect(annulee.body.map((r: { id: string }) => r.id)).toEqual([relation.id]);
  });
});
