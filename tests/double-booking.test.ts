/**
 * Protection contre le double-booking.
 *
 * Deux seniors peuvent viser le meme creneau du meme jeune au meme instant.
 * Sans verrou, les deux requetes passent la verification de conflit avant
 * qu'aucune n'ait insere : le jeune se retrouve avec deux rencontres
 * superposees.
 *
 * La protection combine une transaction et un pg_try_advisory_xact_lock par
 * jeune (storage.createInterventionSafe), avec re-verification du conflit a
 * l'interieur de la transaction. Ces tests lancent de vraies requetes
 * concurrentes : un test sequentiel ne prouverait rien.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs, createRelation, crediterSenior } from "./helpers";
import { prisma } from "../server/prisma";

/** Creneau de test : 15 juin 2026, 14h00 UTC, 90 minutes. */
const CRENEAU = new Date("2026-06-15T14:00:00Z");
const DUREE = 90;

/**
 * Le jeune doit avoir declare sa disponibilite : sans cela, la creation est
 * refusee avant meme d'atteindre le verrou.
 */
async function declarerDisponibilite(juniorId: string) {
  return prisma.availability.create({
    data: {
      userId: juniorId,
      startAt: new Date("2026-06-15T08:00:00Z"),
      endAt: new Date("2026-06-15T20:00:00Z"),
      kind: "AVAILABLE",
    },
  });
}

async function contexteDeuxSeniors() {
  const junior = await createUser("JUNIOR");
  const seniorA = await createUser("SENIOR");
  const seniorB = await createUser("SENIOR");
  const relationA = await createRelation(seniorA.id, junior.id);
  const relationB = await createRelation(seniorB.id, junior.id);
  await declarerDisponibilite(junior.id);
  await crediterSenior(seniorA.id);
  await crediterSenior(seniorB.id);
  return { junior, seniorA, seniorB, relationA, relationB };
}

const corpsRencontre = {
  scheduledDate: CRENEAU.toISOString(),
  durationMinutes: DUREE,
  location: "Chez le senior",
  tasks: ["Jardinage"],
};

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Creation de rencontre — creneau unique", () => {
  it("une premiere proposition sur un creneau libre est acceptee", async () => {
    const { seniorA, relationA } = await contexteDeuxSeniors();
    const agent = await loginAs(seniorA);

    const res = await agent
      .post(`/api/relations/${relationA.id}/interventions`)
      .send(corpsRencontre);

    expect(res.status).toBe(201);
    expect(await prisma.intervention.count()).toBe(1);
  });

  it("une seconde proposition sur le meme creneau est refusee", async () => {
    const { seniorA, seniorB, relationA, relationB } = await contexteDeuxSeniors();

    const agentA = await loginAs(seniorA);
    const premiere = await agentA
      .post(`/api/relations/${relationA.id}/interventions`)
      .send(corpsRencontre);
    expect(premiere.status).toBe(201);

    const agentB = await loginAs(seniorB);
    const seconde = await agentB
      .post(`/api/relations/${relationB.id}/interventions`)
      .send(corpsRencontre);

    expect(seconde.status).toBe(400);
    expect(await prisma.intervention.count()).toBe(1);
  });

  it("un creneau qui chevauche partiellement est aussi refuse", async () => {
    const { seniorA, seniorB, relationA, relationB } = await contexteDeuxSeniors();

    const agentA = await loginAs(seniorA);
    await agentA.post(`/api/relations/${relationA.id}/interventions`).send(corpsRencontre);

    // Debute 45 min apres la premiere, qui dure 90 min : chevauchement.
    const agentB = await loginAs(seniorB);
    const res = await agentB.post(`/api/relations/${relationB.id}/interventions`).send({
      ...corpsRencontre,
      scheduledDate: new Date(CRENEAU.getTime() + 45 * 60_000).toISOString(),
    });

    expect(res.status).toBe(400);
    expect(await prisma.intervention.count()).toBe(1);
  });

  it("un creneau adjacent, sans chevauchement, est accepte", async () => {
    const { seniorA, seniorB, relationA, relationB } = await contexteDeuxSeniors();

    const agentA = await loginAs(seniorA);
    await agentA.post(`/api/relations/${relationA.id}/interventions`).send(corpsRencontre);

    // Commence exactement a la fin de la premiere.
    const agentB = await loginAs(seniorB);
    const res = await agentB.post(`/api/relations/${relationB.id}/interventions`).send({
      ...corpsRencontre,
      scheduledDate: new Date(CRENEAU.getTime() + DUREE * 60_000).toISOString(),
    });

    expect(res.status).toBe(201);
    expect(await prisma.intervention.count()).toBe(2);
  });
});

describe("Concurrence reelle sur le meme creneau", () => {
  it("deux requetes simultanees ne creent qu'une seule rencontre", async () => {
    const { seniorA, seniorB, relationA, relationB } = await contexteDeuxSeniors();

    const agentA = await loginAs(seniorA);
    const agentB = await loginAs(seniorB);

    // Lancees sans await intermediaire : les deux partent avant que l'une
    // ait insere, ce qui est precisement la fenetre de course visee.
    const [resA, resB] = await Promise.all([
      agentA.post(`/api/relations/${relationA.id}/interventions`).send(corpsRencontre),
      agentB.post(`/api/relations/${relationB.id}/interventions`).send(corpsRencontre),
    ]);

    const statuts = [resA.status, resB.status].sort();

    // Une seule creation aboutit. L'autre est refusee soit pour conflit (400),
    // soit pour contention du verrou (409) — les deux sont des refus corrects.
    expect(await prisma.intervention.count()).toBe(1);
    expect(statuts.filter((s) => s === 201)).toHaveLength(1);
    expect(statuts.some((s) => s === 400 || s === 409)).toBe(true);
  });

  it("cinq requetes simultanees ne creent toujours qu'une seule rencontre", async () => {
    const junior = await createUser("JUNIOR");
    await declarerDisponibilite(junior.id);

    const seniors = await Promise.all(
      Array.from({ length: 5 }, () => createUser("SENIOR"))
    );
    const relations = await Promise.all(
      seniors.map((s) => createRelation(s.id, junior.id))
    );
    await Promise.all(seniors.map((s) => crediterSenior(s.id)));
    const agents = await Promise.all(seniors.map((s) => loginAs(s)));

    const resultats = await Promise.all(
      agents.map((agent, i) =>
        agent.post(`/api/relations/${relations[i].id}/interventions`).send(corpsRencontre)
      )
    );

    const crees = resultats.filter((r) => r.status === 201);
    expect(crees).toHaveLength(1);
    expect(await prisma.intervention.count()).toBe(1);
  });
});

describe("Creneau hors disponibilites declarees", () => {
  it("une proposition hors des disponibilites du jeune est refusee", async () => {
    const { seniorA, relationA } = await contexteDeuxSeniors();
    const agent = await loginAs(seniorA);

    // Le jeune est disponible de 08h a 20h : 23h est hors plage.
    const res = await agent.post(`/api/relations/${relationA.id}/interventions`).send({
      ...corpsRencontre,
      scheduledDate: new Date("2026-06-15T23:00:00Z").toISOString(),
    });

    expect(res.status).toBe(400);
    expect(await prisma.intervention.count()).toBe(0);
  });
});
