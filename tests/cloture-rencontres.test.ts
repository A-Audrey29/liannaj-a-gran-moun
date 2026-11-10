/**
 * Clôture des rencontres (décision du 2026-11-10).
 *
 *  - le senior ou son aidant déclare la rencontre réalisée, une fois terminée
 *    et confirmée par le jeune ; le jeune ne peut pas ;
 *  - sans déclaration, une rencontre CONFIRMED se clôture seule 48h après la
 *    fin (job meeting-auto-complete), avec le même débit ;
 *  - l'admin garde la main : il clôture même une rencontre jamais confirmée,
 *    voit qui a clôturé, et corrige « n'a pas eu lieu » (crédit rendu).
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import { resetDatabase, createUser, createRelation, crediterSenior, loginAs } from "./helpers";
import { prisma } from "../server/prisma";
import { pool } from "../server/db";
import { checkAndAutoCompleteMeetings } from "../server/lib/meeting-auto-complete";
import { isMeetingAutoCompletable } from "../shared/meeting-check";

const HEURE = 60 * 60 * 1000;

async function solde(seniorId: string) {
  const { _sum } = await prisma.creditLedger.aggregate({ where: { seniorId }, _sum: { amount: true } });
  return _sum.amount ?? 0;
}

/** Relation active, senior crédité, une rencontre d'1h qui a commencé il y a `ilYa` ms. */
async function rencontre(status: "PROPOSED" | "CONFIRMED", ilYa: number) {
  const senior = await createUser("SENIOR");
  const junior = await createUser("JUNIOR");
  const relation = await createRelation(senior.id, junior.id);
  await crediterSenior(senior.id, 5);
  const intervention = await prisma.intervention.create({
    data: { relationId: relation.id, status, scheduledDate: new Date(Date.now() - ilYa), durationMinutes: 60 },
  });
  return { senior, junior, relation, intervention };
}

beforeEach(async () => {
  await resetDatabase();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

describe("le senior ou son aidant déclare la rencontre réalisée", () => {
  it("le senior : statut clôturé, 1 crédit débité, trace de qui a clôturé", async () => {
    const { senior, intervention } = await rencontre("CONFIRMED", 2 * HEURE);
    const res = await (await loginAs(senior)).patch(`/api/interventions/${intervention.id}/done`);
    expect(res.status).toBe(200);

    const apres = await prisma.intervention.findUniqueOrThrow({ where: { id: intervention.id } });
    expect(apres.status).toBe("COMPLETED_PENDING_FEEDBACK");
    expect(apres.completedById).toBe(senior.id);
    expect(apres.completedAutomatically).toBe(false);
    expect(await solde(senior.id)).toBe(4);
  });

  it("l'aidant du senior peut aussi", async () => {
    const { senior, intervention } = await rencontre("CONFIRMED", 2 * HEURE);
    const aidant = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const res = await (await loginAs(aidant)).patch(`/api/interventions/${intervention.id}/done`);
    expect(res.status).toBe(200);
    expect(await solde(senior.id)).toBe(4);
  });

  it("refuse le jeune, et l'aidant d'un autre senior", async () => {
    const { junior, senior, intervention } = await rencontre("CONFIRMED", 2 * HEURE);
    const autreSenior = await createUser("SENIOR");
    const autreAidant = await createUser("REFERENT_SENIOR", { linkedSeniorId: autreSenior.id });

    expect((await (await loginAs(junior)).patch(`/api/interventions/${intervention.id}/done`)).status).toBe(403);
    expect((await (await loginAs(autreAidant)).patch(`/api/interventions/${intervention.id}/done`)).status).toBe(403);
    expect(await solde(senior.id)).toBe(5);
  });

  it("refuse une rencontre pas encore terminée", async () => {
    const { senior, intervention } = await rencontre("CONFIRMED", 30 * 60 * 1000); // en cours
    const res = await (await loginAs(senior)).patch(`/api/interventions/${intervention.id}/done`);
    expect(res.status).toBe(400);
    expect(await solde(senior.id)).toBe(5);
  });

  it("refuse une rencontre jamais confirmée par le jeune (seul l'admin peut)", async () => {
    const { senior, intervention } = await rencontre("PROPOSED", 3 * HEURE);
    const res = await (await loginAs(senior)).patch(`/api/interventions/${intervention.id}/done`);
    expect(res.status).toBe(400);
  });

  it("deux déclarations simultanées ne débitent qu'une fois", async () => {
    const { senior, intervention } = await rencontre("CONFIRMED", 2 * HEURE);
    const agent = await loginAs(senior);
    const [a, b] = await Promise.all([
      agent.patch(`/api/interventions/${intervention.id}/done`),
      agent.patch(`/api/interventions/${intervention.id}/done`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await solde(senior.id)).toBe(4);
  });
});

describe("clôture automatique 48h après la fin", () => {
  it("clôture une rencontre confirmée terminée depuis plus de 48h, débite et prévient les admins", async () => {
    const admin = await createUser("ADMIN");
    const { senior, intervention } = await rencontre("CONFIRMED", 50 * HEURE);

    expect(await checkAndAutoCompleteMeetings()).toBe(1);

    const apres = await prisma.intervention.findUniqueOrThrow({ where: { id: intervention.id } });
    expect(apres.status).toBe("COMPLETED_PENDING_FEEDBACK");
    expect(apres.completedAutomatically).toBe(true);
    expect(apres.completedById).toBeNull();
    expect(await solde(senior.id)).toBe(4);
    const notifs = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toBe("Rencontres clôturées automatiquement");
  });

  it("ne touche pas une rencontre terminée depuis moins de 48h", async () => {
    // Début il y a 48h, durée 1h : fin il y a 47h.
    const { intervention } = await rencontre("CONFIRMED", 48 * HEURE);
    expect(await checkAndAutoCompleteMeetings()).toBe(0);
    expect((await prisma.intervention.findUniqueOrThrow({ where: { id: intervention.id } })).status).toBe("CONFIRMED");
  });

  it("ne clôture jamais une rencontre jamais confirmée (PROPOSED)", async () => {
    const { intervention } = await rencontre("PROPOSED", 10 * 24 * HEURE);
    expect(await checkAndAutoCompleteMeetings()).toBe(0);
    expect((await prisma.intervention.findUniqueOrThrow({ where: { id: intervention.id } })).status).toBe("PROPOSED");
  });

  it("une seconde passe ne débite pas deux fois", async () => {
    const { senior } = await rencontre("CONFIRMED", 50 * HEURE);
    await checkAndAutoCompleteMeetings();
    expect(await checkAndAutoCompleteMeetings()).toBe(0);
    expect(await solde(senior.id)).toBe(4);
  });

  it("ne fait rien si une autre instance tient le verrou", async () => {
    const { intervention } = await rencontre("CONFIRMED", 50 * HEURE);
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [4_812_359]);
      expect(await checkAndAutoCompleteMeetings()).toBe(0);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [4_812_359]);
      client.release();
    }
    expect((await prisma.intervention.findUniqueOrThrow({ where: { id: intervention.id } })).status).toBe("CONFIRMED");
  });

  it("règle partagée : bascule exactement 48h après la fin", () => {
    const debut = new Date("2026-11-01T10:00:00Z"); // fin 11:00
    const pile = new Date("2026-11-03T11:00:00Z");
    const m = { status: "CONFIRMED", scheduledDate: debut, durationMinutes: 60 };
    expect(isMeetingAutoCompletable(m, pile)).toBe(true);
    expect(isMeetingAutoCompletable(m, new Date(pile.getTime() - 1))).toBe(false);
  });
});

describe("contrôle admin", () => {
  it("l'admin peut clôturer une rencontre jamais confirmée par le jeune", async () => {
    const admin = await createUser("ADMIN");
    const { senior, intervention } = await rencontre("PROPOSED", 3 * HEURE);
    const res = await (await loginAs(admin)).patch(`/api/interventions/${intervention.id}/done`);
    expect(res.status).toBe(200);
    expect(await solde(senior.id)).toBe(4);
  });

  it("« n'a pas eu lieu » : annule et rend le crédit, une seule fois", async () => {
    const admin = await createUser("ADMIN");
    const { senior, intervention } = await rencontre("CONFIRMED", 50 * HEURE);
    await checkAndAutoCompleteMeetings();
    expect(await solde(senior.id)).toBe(4);

    const agent = await loginAs(admin);
    const res = await agent.patch(`/api/interventions/${intervention.id}/not-held`);
    expect(res.status).toBe(200);
    expect(res.body.refunded).toBe(true);
    expect((await prisma.intervention.findUniqueOrThrow({ where: { id: intervention.id } })).status).toBe("CANCELLED");
    expect(await solde(senior.id)).toBe(5);

    // Second call: not closed anymore, nothing given back twice.
    expect((await agent.patch(`/api/interventions/${intervention.id}/not-held`)).status).toBe(400);
    expect(await solde(senior.id)).toBe(5);
  });

  it("« n'a pas eu lieu » sur une rencontre gratuite : rien à rendre", async () => {
    const admin = await createUser("ADMIN");
    const { senior, intervention } = await rencontre("CONFIRMED", 3 * HEURE);
    await prisma.intervention.update({ where: { id: intervention.id }, data: { isFree: true } });
    await (await loginAs(senior)).patch(`/api/interventions/${intervention.id}/done`);
    expect(await solde(senior.id)).toBe(5);

    const res = await (await loginAs(admin)).patch(`/api/interventions/${intervention.id}/not-held`);
    expect(res.body.refunded).toBe(false);
    expect(await solde(senior.id)).toBe(5);
  });

  it("réservé à l'admin", async () => {
    const { senior, intervention } = await rencontre("CONFIRMED", 3 * HEURE);
    await (await loginAs(senior)).patch(`/api/interventions/${intervention.id}/done`);
    expect((await (await loginAs(senior)).patch(`/api/interventions/${intervention.id}/not-held`)).status).toBe(403);
  });

  it("l'historique admin indique qui a clôturé", async () => {
    const admin = await createUser("ADMIN");
    const auto = await rencontre("CONFIRMED", 50 * HEURE);
    await checkAndAutoCompleteMeetings();
    const parSenior = await rencontre("CONFIRMED", 3 * HEURE);
    await (await loginAs(parSenior.senior)).patch(`/api/interventions/${parSenior.intervention.id}/done`);

    const res = await (await loginAs(admin)).get("/api/meetings/history");
    expect(res.status).toBe(200);
    const byId = new Map(res.body.entries.map((e: any) => [e.id, e.closure]));
    expect(byId.get(auto.intervention.id)).toMatchObject({ by: "AUTO", name: null });
    expect(byId.get(parSenior.intervention.id)).toMatchObject({
      by: "SENIOR",
      name: `${parSenior.senior.firstName} ${parSenior.senior.lastName}`,
    });
  });
});
