/**
 * Systeme de credits prepayes pour les ateliers.
 *
 * 1 credit = 1 intervention, decompte a la completion (COMPLETED_PENDING_FEEDBACK),
 * jamais a la creation : aucune logique de remboursement n'est necessaire car
 * l'annulation n'est plus possible passe ce statut.
 *
 * La toute premiere rencontre d'une relation (PENDING_FIRST_MEETING) est
 * gratuite tant qu'elle ne depasse pas 30 minutes prevues.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs, createRelation, crediterSenior } from "./helpers";
import { prisma } from "../server/prisma";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

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

describe("Blocage a la creation sans credit", () => {
  it("un senior sans credit ne peut pas proposer d'intervention sur une relation active", async () => {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");
    const relation = await createRelation(senior.id, junior.id, "ACTIVE");
    await declarerDisponibilite(junior.id);

    const agent = await loginAs(senior);
    const res = await agent.post(`/api/relations/${relation.id}/interventions`).send({
      scheduledDate: "2026-06-15T14:00:00Z",
      durationMinutes: 90,
      location: "Chez le senior",
      tasks: ["Jardinage"],
    });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("INSUFFICIENT_CREDITS");
    expect(await prisma.intervention.count()).toBe(0);
  });

  it("apres achat de credits, la creation est acceptee", async () => {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");
    const relation = await createRelation(senior.id, junior.id, "ACTIVE");
    await declarerDisponibilite(junior.id);
    await crediterSenior(senior.id, 3);

    const agent = await loginAs(senior);
    const res = await agent.post(`/api/relations/${relation.id}/interventions`).send({
      scheduledDate: "2026-06-15T14:00:00Z",
      durationMinutes: 90,
      location: "Chez le senior",
      tasks: ["Jardinage"],
    });

    expect(res.status).toBe(201);
  });

  it("le referent lie a un senior sans credit se voit aussi refuser la creation", async () => {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const relation = await createRelation(senior.id, junior.id, "ACTIVE");
    await declarerDisponibilite(junior.id);

    const agent = await loginAs(referent);
    const res = await agent.post("/api/referent/interventions").send({
      relationId: relation.id,
      scheduledDate: "2026-06-15T14:00:00Z",
      durationMinutes: 90,
      location: "Chez le senior",
      tasks: ["Jardinage"],
    });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("INSUFFICIENT_CREDITS");
  });
});

describe("Premiere rencontre gratuite", () => {
  it("une premiere rencontre de 30 minutes ou moins est acceptee sans credit", async () => {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");
    const relation = await createRelation(senior.id, junior.id, "PENDING_FIRST_MEETING");
    const admin = await createUser("ADMIN");
    await declarerDisponibilite(junior.id);

    const agent = await loginAs(admin);
    const res = await agent.post(`/api/relations/${relation.id}/interventions`).send({
      scheduledDate: "2026-06-15T14:00:00Z",
      durationMinutes: 30,
      location: "Chez le senior",
      tasks: ["Decouverte"],
    });

    expect(res.status).toBe(201);
    expect(await prisma.creditLedger.count({ where: { seniorId: senior.id } })).toBe(0);
  });

  it("une premiere rencontre de plus de 30 minutes est bloquee sans credit", async () => {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");
    const relation = await createRelation(senior.id, junior.id, "PENDING_FIRST_MEETING");
    const admin = await createUser("ADMIN");
    await declarerDisponibilite(junior.id);

    const agent = await loginAs(admin);
    const res = await agent.post(`/api/relations/${relation.id}/interventions`).send({
      scheduledDate: "2026-06-15T14:00:00Z",
      durationMinutes: 60,
      location: "Chez le senior",
      tasks: ["Decouverte"],
    });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe("INSUFFICIENT_CREDITS");
  });
});

describe("Decompte a la completion", () => {
  async function creerEtConfirmer(durationMinutes = 90) {
    const junior = await createUser("JUNIOR");
    const senior = await createUser("SENIOR");
    const admin = await createUser("ADMIN");
    const relation = await createRelation(senior.id, junior.id, "ACTIVE");
    await declarerDisponibilite(junior.id);
    await crediterSenior(senior.id, 5);

    const seniorAgent = await loginAs(senior);
    const creation = await seniorAgent.post(`/api/relations/${relation.id}/interventions`).send({
      scheduledDate: "2026-06-15T14:00:00Z",
      durationMinutes,
      location: "Chez le senior",
      tasks: ["Jardinage"],
    });
    expect(creation.status).toBe(201);
    const interventionId = creation.body.id;

    const juniorAgent = await loginAs(junior);
    const confirmation = await juniorAgent.patch(`/api/interventions/${interventionId}/confirm`);
    expect(confirmation.status).toBe(200);

    return { senior, admin, interventionId };
  }

  it("la creation ne decremente pas le solde, seule la completion le fait", async () => {
    const { senior, admin, interventionId } = await creerEtConfirmer();

    const soldeAvantDone = await prisma.creditLedger.aggregate({
      where: { seniorId: senior.id },
      _sum: { amount: true },
    });
    expect(soldeAvantDone._sum.amount).toBe(5);

    const adminAgent = await loginAs(admin);
    const done = await adminAgent.patch(`/api/interventions/${interventionId}/done`);
    expect(done.status).toBe(200);

    const soldeApresDone = await prisma.creditLedger.aggregate({
      where: { seniorId: senior.id },
      _sum: { amount: true },
    });
    expect(soldeApresDone._sum.amount).toBe(4);

    const consommation = await prisma.creditLedger.findFirst({
      where: { seniorId: senior.id, type: "CONSUMPTION" },
    });
    expect(consommation?.interventionId).toBe(interventionId);
    expect(consommation?.amount).toBe(-1);
  });
});

describe("Achat de credits par l'admin", () => {
  it("attribue les credits au senior directement", async () => {
    const senior = await createUser("SENIOR");
    const admin = await createUser("ADMIN");

    const agent = await loginAs(admin);
    const res = await agent.post("/api/admin/payments").send({
      userId: senior.id,
      amount: 90,
      label: "Pack 5 credits",
      credits: 5,
    });

    expect(res.status).toBe(201);
    const balance = await prisma.creditLedger.aggregate({
      where: { seniorId: senior.id },
      _sum: { amount: true },
    });
    expect(balance._sum.amount).toBe(5);
  });

  it("attribue les credits au senior lie quand le payeur est un referent", async () => {
    const senior = await createUser("SENIOR");
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const admin = await createUser("ADMIN");

    const agent = await loginAs(admin);
    const res = await agent.post("/api/admin/payments").send({
      userId: referent.id,
      amount: 90,
      label: "Pack 5 credits offert par l'aidant",
      credits: 5,
    });

    expect(res.status).toBe(201);
    const balanceSenior = await prisma.creditLedger.aggregate({
      where: { seniorId: senior.id },
      _sum: { amount: true },
    });
    expect(balanceSenior._sum.amount).toBe(5);
    const balanceReferent = await prisma.creditLedger.count({ where: { seniorId: referent.id } });
    expect(balanceReferent).toBe(0);
  });

  it("refuse d'attribuer des credits a un referent sans senior lie", async () => {
    const referent = await createUser("REFERENT_SENIOR");
    const admin = await createUser("ADMIN");

    const agent = await loginAs(admin);
    const res = await agent.post("/api/admin/payments").send({
      userId: referent.id,
      amount: 90,
      label: "Pack 5 credits",
      credits: 5,
    });

    expect(res.status).toBe(400);
  });
});

describe("Endpoint de consultation du solde", () => {
  it("un senior consulte son propre solde", async () => {
    const senior = await createUser("SENIOR");
    await crediterSenior(senior.id, 7);

    const agent = await loginAs(senior);
    const res = await agent.get("/api/credits/balance");

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(7);
  });

  it("un referent consulte le solde de son senior lie", async () => {
    const senior = await createUser("SENIOR");
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    await crediterSenior(senior.id, 4);

    const agent = await loginAs(referent);
    const res = await agent.get("/api/credits/balance");

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(4);
  });
});
