/**
 * Reservation des credits et rencontre gratuite (decision du 2026-10-12).
 *
 * - Un atelier prevu (PROPOSED/CONFIRMED) reserve un credit : avec 1 credit,
 *   un seul atelier payant a venir. Le debit reste a la completion.
 * - Une seule rencontre gratuite par relation : <= 30 min, relation en attente
 *   de sa premiere rencontre, aucune rencontre anterieure non annulee.
 * - Valider deux fois la meme rencontre (double clic, deux admins) ne debite
 *   qu'une fois.
 *
 * Les cas concurrents lancent de vraies requetes en parallele : un test
 * sequentiel ne prouverait rien sur les verrous.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs, createRelation, crediterSenior } from "./helpers";
import { prisma } from "../server/prisma";
import { storage } from "../server/storage";

async function disponible(juniorId: string) {
  return prisma.availability.create({
    data: {
      userId: juniorId,
      startAt: new Date("2026-06-15T06:00:00Z"),
      endAt: new Date("2026-06-15T23:00:00Z"),
      kind: "AVAILABLE",
    },
  });
}

function rencontre(heureUtc: number, durationMinutes = 90) {
  return {
    scheduledDate: `2026-06-15T${String(heureUtc).padStart(2, "0")}:00:00Z`,
    durationMinutes,
    location: "Chez le senior",
    tasks: ["Jardinage"],
  };
}

async function relationActive(seniorId: string) {
  const junior = await createUser("JUNIOR");
  const relation = await createRelation(seniorId, junior.id, "ACTIVE");
  await disponible(junior.id);
  return { junior, relation };
}

function consommations(seniorId: string) {
  return prisma.creditLedger.count({ where: { seniorId, type: "CONSUMPTION" } });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("reservation des credits a la creation", () => {
  it("avec 1 credit, un seul atelier payant peut etre prevu", async () => {
    const senior = await createUser("SENIOR");
    const { relation } = await relationActive(senior.id);
    await crediterSenior(senior.id, 1);
    const agent = await loginAs(senior);

    const premier = await agent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10));
    const second = await agent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(14));

    expect(premier.status).toBe(201);
    expect(second.status).toBe(402);
    expect(second.body.code).toBe("INSUFFICIENT_CREDITS");
  });

  it("annuler un atelier prevu libere son credit", async () => {
    const senior = await createUser("SENIOR");
    const { relation } = await relationActive(senior.id);
    await crediterSenior(senior.id, 1);
    const agent = await loginAs(senior);

    const premier = await agent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10));
    await agent.patch(`/api/interventions/${premier.body.id}/cancel`);
    const apresAnnulation = await agent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(14));

    expect(apresAnnulation.status).toBe(201);
  });

  it("des reservations simultanees sur des jeunes differents ne consomment pas le meme dernier credit", async () => {
    const senior = await createUser("SENIOR");
    const relations = [];
    for (let i = 0; i < 5; i++) relations.push((await relationActive(senior.id)).relation);
    await crediterSenior(senior.id, 1);
    const agent = await loginAs(senior);

    const resultats = await Promise.all(
      relations.map((r) => agent.post(`/api/relations/${r.id}/interventions`).send(rencontre(10)))
    );

    expect(resultats.filter((r) => r.status === 201)).toHaveLength(1);
    expect(resultats.filter((r) => r.status === 402)).toHaveLength(4);
    expect(await prisma.intervention.count()).toBe(1);
  });
});

describe("une seule rencontre gratuite par relation", () => {
  async function relationEnAttente() {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const admin = await createUser("ADMIN");
    const relation = await createRelation(senior.id, junior.id, "PENDING_FIRST_MEETING");
    await disponible(junior.id);
    return { senior, junior, relation, adminAgent: await loginAs(admin) };
  }

  it("la premiere rencontre de 30 min est gratuite, une seconde rencontre courte ne l'est pas", async () => {
    const { relation, adminAgent } = await relationEnAttente();

    const premiere = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10, 30));
    const seconde = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(14, 30));

    expect(premiere.status).toBe(201);
    expect(seconde.status).toBe(402);
  });

  it("une premiere rencontre de plus de 30 min demande un credit", async () => {
    const { relation, adminAgent } = await relationEnAttente();

    const res = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10, 45));

    expect(res.status).toBe(402);
  });

  it("si la rencontre gratuite est annulee, la suivante redevient gratuite", async () => {
    const { relation, adminAgent } = await relationEnAttente();

    const premiere = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10, 30));
    await adminAgent.patch(`/api/interventions/${premiere.body.id}/cancel`);
    const remplacement = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(14, 30));

    expect(remplacement.status).toBe(201);
  });

  it("la rencontre gratuite ne reserve pas de credit", async () => {
    const { senior, relation, adminAgent } = await relationEnAttente();
    const autre = await relationActive(senior.id);
    await crediterSenior(senior.id, 1);

    const gratuite = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10, 30));
    const payante = await (await loginAs(senior))
      .post(`/api/relations/${autre.relation.id}/interventions`)
      .send(rencontre(14));

    expect(gratuite.status).toBe(201);
    expect(payante.status).toBe(201);
  });

  it("la completion de la rencontre gratuite ne debite rien", async () => {
    const { senior, junior, relation, adminAgent } = await relationEnAttente();

    const premiere = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10, 30));
    await (await loginAs(junior)).patch(`/api/interventions/${premiere.body.id}/confirm`);
    const done = await adminAgent.patch(`/api/interventions/${premiere.body.id}/done`);

    expect(done.status).toBe(200);
    expect(await consommations(senior.id)).toBe(0);
  });
});

describe("validation d'une rencontre realisee", () => {
  it("deux validations simultanees ne debitent qu'un seul credit", async () => {
    const senior = await createUser("SENIOR");
    const { junior, relation } = await relationActive(senior.id);
    const admin = await createUser("ADMIN");
    await crediterSenior(senior.id, 3);

    const creee = await (await loginAs(senior)).post(`/api/relations/${relation.id}/interventions`).send(rencontre(10));
    await (await loginAs(junior)).patch(`/api/interventions/${creee.body.id}/confirm`);
    const adminAgent = await loginAs(admin);

    const resultats = await Promise.all([
      adminAgent.patch(`/api/interventions/${creee.body.id}/done`),
      adminAgent.patch(`/api/interventions/${creee.body.id}/done`),
    ]);

    const statuts = resultats.map((r) => r.status).sort();
    // Le perdant voit soit le statut deja change (400), soit l'echec de la
    // mise a jour conditionnelle (409) : jamais un second debit.
    expect(statuts[0]).toBe(200);
    expect([400, 409]).toContain(statuts[1]);
    expect(await consommations(senior.id)).toBe(1);
  });
});

describe("gratuite memorisee a la creation", () => {
  it("cloturer la rencontre payante avant la gratuite ne fait pas perdre la gratuite", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const admin = await createUser("ADMIN");
    const relation = await createRelation(senior.id, junior.id, "PENDING_FIRST_MEETING");
    await disponible(junior.id);
    await crediterSenior(senior.id, 1);
    const adminAgent = await loginAs(admin);
    const juniorAgent = await loginAs(junior);

    // A : gratuite (creee en premier, 30 min). B : payante, prevue plus tot.
    const a = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(16, 30));
    const b = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10, 60));
    expect([a.status, b.status]).toEqual([201, 201]);
    await juniorAgent.patch(`/api/interventions/${a.body.id}/confirm`);
    await juniorAgent.patch(`/api/interventions/${b.body.id}/confirm`);

    // B est cloturee d'abord : la relation passe ACTIVE.
    expect((await adminAgent.patch(`/api/interventions/${b.body.id}/done`)).status).toBe(200);
    expect((await adminAgent.patch(`/api/interventions/${a.body.id}/done`)).status).toBe(200);

    expect(await consommations(senior.id)).toBe(1);
  });
});

describe("annulation et validation simultanees", () => {
  it("une rencontre n'est jamais a la fois annulee et debitee", async () => {
    for (let essai = 0; essai < 5; essai++) {
      await resetDatabase();
      const senior = await createUser("SENIOR");
      const { junior, relation } = await relationActive(senior.id);
      const admin = await createUser("ADMIN");
      await crediterSenior(senior.id, 3);
      const creee = await (await loginAs(senior)).post(`/api/relations/${relation.id}/interventions`).send(rencontre(10));
      await (await loginAs(junior)).patch(`/api/interventions/${creee.body.id}/confirm`);
      const adminAgent = await loginAs(admin);

      await Promise.all([
        adminAgent.patch(`/api/interventions/${creee.body.id}/done`),
        adminAgent.patch(`/api/interventions/${creee.body.id}/cancel`),
      ]);

      const finale = await prisma.intervention.findUniqueOrThrow({ where: { id: creee.body.id } });
      const debits = await consommations(senior.id);
      if (finale.status === "CANCELLED") expect(debits).toBe(0);
      else expect([finale.status, debits]).toEqual(["COMPLETED_PENDING_FEEDBACK", 1]);
    }
  });
});

describe("annulation de la rencontre gratuite", () => {
  it("la gratuite passe a la rencontre courte suivante et libere son credit", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const admin = await createUser("ADMIN");
    const relation = await createRelation(senior.id, junior.id, "PENDING_FIRST_MEETING");
    await disponible(junior.id);
    await crediterSenior(senior.id, 1);
    const adminAgent = await loginAs(admin);

    const a = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10, 30));
    const b = await adminAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(14, 30));
    expect((await prisma.intervention.findUniqueOrThrow({ where: { id: b.body.id } })).isFree).toBe(false);

    await adminAgent.patch(`/api/interventions/${a.body.id}/cancel`);

    expect((await prisma.intervention.findUniqueOrThrow({ where: { id: b.body.id } })).isFree).toBe(true);
    const solde = await (await loginAs(senior)).get("/api/credits/balance");
    expect(solde.body).toEqual({ balance: 1, available: 1 });
  });
});

describe("confirmation et annulation simultanees", () => {
  it("une rencontre annulee ne redevient jamais confirmee", async () => {
    for (let essai = 0; essai < 5; essai++) {
      await resetDatabase();
      const senior = await createUser("SENIOR");
      const { junior, relation } = await relationActive(senior.id);
      await crediterSenior(senior.id, 2);
      const seniorAgent = await loginAs(senior);
      const creee = await seniorAgent.post(`/api/relations/${relation.id}/interventions`).send(rencontre(10));
      const juniorAgent = await loginAs(junior);

      const [confirmation, annulation] = await Promise.all([
        juniorAgent.patch(`/api/interventions/${creee.body.id}/confirm`),
        seniorAgent.patch(`/api/interventions/${creee.body.id}/cancel`),
      ]);

      const finale = await prisma.intervention.findUniqueOrThrow({ where: { id: creee.body.id } });
      if (annulation.status === 200) expect(finale.status).toBe("CANCELLED");
      if (confirmation.status === 200 && annulation.status !== 200) expect(finale.status).toBe("CONFIRMED");
    }
  });
});

describe("transitions conditionnelles (garde contre les ecritures concurrentes)", () => {
  async function rencontreAvecStatut(status: "PROPOSED" | "CONFIRMED" | "CANCELLED" | "COMPLETED_PENDING_FEEDBACK") {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id);
    return prisma.intervention.create({
      data: { relationId: relation.id, status, scheduledDate: new Date("2026-06-15T14:00:00Z") },
    });
  }

  it("confirmer une rencontre deja annulee ne la ressuscite pas", async () => {
    const r = await rencontreAvecStatut("CANCELLED");
    expect(await storage.confirmIntervention(r.id)).toBeNull();
    expect((await prisma.intervention.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("CANCELLED");
  });

  it("annuler une rencontre deja realisee (donc debitee) est refuse", async () => {
    const r = await rencontreAvecStatut("COMPLETED_PENDING_FEEDBACK");
    expect(await storage.cancelIntervention(r.id)).toBeNull();
    expect((await prisma.intervention.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("COMPLETED_PENDING_FEEDBACK");
  });

  it("valider une rencontre deja annulee ne debite rien", async () => {
    const r = await rencontreAvecStatut("CANCELLED");
    const relation = await prisma.relation.findUniqueOrThrow({ where: { id: r.relationId } });
    expect(await storage.completeIntervention(r.id, relation.seniorId, relation.seniorId)).toBeNull();
    expect(await consommations(relation.seniorId)).toBe(0);
  });
});

