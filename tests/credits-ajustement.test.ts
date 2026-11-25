/**
 * Ajustement manuel des credits par un admin (POST /api/admin/credits/adjustments)
 * et historique complet cote admin (GET /api/admin/credits/ledger).
 *
 * - Reserve a l'admin ; cible = un senior uniquement.
 * - Note obligatoire ; reference obligatoire apres un remboursement, et
 *   utilisable une seule fois pour un retrait.
 * - Jamais de solde negatif, jamais les credits deja reserves par un atelier prevu.
 * - Toujours une nouvelle ligne ADJUSTMENT ; note et reference jamais
 *   renvoyees au senior.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs, createRelation, crediterSenior } from "./helpers";
import { prisma } from "../server/prisma";

const NOTE = "Remboursement demandé par la famille le 12/12";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function solde(seniorId: string) {
  const { _sum } = await prisma.creditLedger.aggregate({ where: { seniorId }, _sum: { amount: true } });
  return _sum.amount ?? 0;
}

async function adminEtSenior(credits = 5) {
  const admin = await createUser("ADMIN");
  const senior = await createUser("SENIOR");
  if (credits) await crediterSenior(senior.id, credits);
  return { admin, senior, agent: await loginAs(admin) };
}

describe("POST /api/admin/credits/adjustments", () => {
  it("retire des credits apres un remboursement, avec qui, pourquoi et la reference", async () => {
    const { admin, senior, agent } = await adminEtSenior(5);

    const res = await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: -5, afterRefund: true, externalReference: "re_AbC123", adminNote: NOTE,
    });

    expect(res.status).toBe(201);
    expect(await solde(senior.id)).toBe(0);
    const ligne = await prisma.creditLedger.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(ligne).toMatchObject({
      type: "ADJUSTMENT", amount: -5, triggeredById: admin.id,
      externalReference: "re_AbC123", adminNote: NOTE, reason: "Achat remboursé — crédits retirés",
    });
  });

  it("ajoute des credits sans reference (geste, correction)", async () => {
    const { senior, agent } = await adminEtSenior(0);

    const res = await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: 2, afterRefund: false, adminNote: "Atelier offert suite au bug du 03/12",
    });

    expect(res.status).toBe(201);
    expect(await solde(senior.id)).toBe(2);
  });

  it("refuse sans note, ou avec une note trop courte", async () => {
    const { senior, agent } = await adminEtSenior();
    for (const adminNote of [undefined, "", "   court   "]) {
      const res = await agent.post("/api/admin/credits/adjustments").send({
        seniorId: senior.id, amount: 1, afterRefund: false, adminNote,
      });
      expect(res.status).toBe(400);
    }
    expect(await solde(senior.id)).toBe(5);
  });

  it("apres un remboursement : reference obligatoire, et c'est un retrait", async () => {
    const { senior, agent } = await adminEtSenior();
    const sansRef = await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: -1, afterRefund: true, adminNote: NOTE,
    });
    const ajout = await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: 1, afterRefund: true, externalReference: "re_AbC123", adminNote: NOTE,
    });
    expect(sansRef.status).toBe(400);
    expect(sansRef.body.errors.externalReference).toBeDefined();
    expect(ajout.status).toBe(400);
    expect(await solde(senior.id)).toBe(5);
  });

  it("controle la forme de la reference (Mollie mal formee, caracteres interdits)", async () => {
    const { senior, agent } = await adminEtSenior();
    for (const externalReference of ["re_", "tr_abc-12", "ab", "ref<script>", "x".repeat(101)]) {
      const res = await agent.post("/api/admin/credits/adjustments").send({
        seniorId: senior.id, amount: -1, afterRefund: true, externalReference, adminNote: NOTE,
      });
      expect(res.status, externalReference).toBe(400);
    }
    // Reference de virement Qonto : format libre accepte.
    const qonto = await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: -1, afterRefund: true, externalReference: "VIR-2026-12-0042", adminNote: NOTE,
    });
    expect(qonto.status).toBe(201);
  });

  it("refuse 0, un nombre non entier, et plus de 10 credits d'un coup", async () => {
    const { senior, agent } = await adminEtSenior();
    for (const amount of [0, 1.5, 11, -11, "2"]) {
      const res = await agent.post("/api/admin/credits/adjustments").send({
        seniorId: senior.id, amount, afterRefund: false, adminNote: NOTE,
      });
      expect(res.status, String(amount)).toBe(400);
    }
    expect(await solde(senior.id)).toBe(5);
  });

  it("ne rend jamais le solde negatif", async () => {
    const { senior, agent } = await adminEtSenior(2);
    const res = await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: -3, afterRefund: false, adminNote: NOTE,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("2 crédit(s) disponible(s)");
    expect(await solde(senior.id)).toBe(2);
  });

  it("ne retire pas les credits deja reserves par un atelier prevu", async () => {
    const { senior, agent } = await adminEtSenior(2);
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id);
    await prisma.intervention.create({
      data: { relationId: relation.id, status: "CONFIRMED", scheduledDate: new Date("2026-12-15T14:00:00Z") },
    });

    const trop = await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: -2, afterRefund: false, adminNote: NOTE,
    });
    const ok = await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: -1, afterRefund: false, adminNote: NOTE,
    });

    expect(trop.status).toBe(409);
    expect(ok.status).toBe(201);
    expect(await solde(senior.id)).toBe(1);
  });

  it("une reference de remboursement ne sert qu'une fois, meme sur un autre senior", async () => {
    const { senior, agent } = await adminEtSenior(5);
    const autre = await createUser("SENIOR");
    await crediterSenior(autre.id, 5);
    const corps = { amount: -1, afterRefund: true, externalReference: "re_AbC123", adminNote: NOTE };

    expect((await agent.post("/api/admin/credits/adjustments").send({ ...corps, seniorId: senior.id })).status).toBe(201);
    const deuxieme = await agent.post("/api/admin/credits/adjustments").send({ ...corps, seniorId: senior.id });
    const ailleurs = await agent.post("/api/admin/credits/adjustments").send({ ...corps, seniorId: autre.id });

    expect(deuxieme.status).toBe(409);
    expect(ailleurs.status).toBe(409);
    expect(await solde(senior.id)).toBe(4);
    expect(await solde(autre.id)).toBe(5);
  });

  it("double clic simultane sur le meme remboursement : un seul retrait", async () => {
    const { senior, agent } = await adminEtSenior(5);
    const corps = { seniorId: senior.id, amount: -2, afterRefund: true, externalReference: "re_AbC123", adminNote: NOTE };

    const statuts = (await Promise.all([1, 2, 3].map(() => agent.post("/api/admin/credits/adjustments").send(corps))))
      .map((r) => r.status)
      .sort();

    expect(statuts).toEqual([201, 409, 409]);
    expect(await solde(senior.id)).toBe(3);
  });

  it("retraits simultanes : jamais plus que le solde", async () => {
    const { senior, agent } = await adminEtSenior(3);
    const corps = { seniorId: senior.id, amount: -2, afterRefund: false, adminNote: NOTE };

    await Promise.all([1, 2, 3].map(() => agent.post("/api/admin/credits/adjustments").send(corps)));

    expect(await solde(senior.id)).toBe(1);
  });

  it("cible un senior uniquement (pas un aidant, un jeune ou un id inconnu)", async () => {
    const { senior, agent } = await adminEtSenior();
    const aidant = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const junior = await createUser("JUNIOR");
    for (const seniorId of [aidant.id, junior.id, "inconnu"]) {
      const res = await agent.post("/api/admin/credits/adjustments").send({
        seniorId, amount: 1, afterRefund: false, adminNote: NOTE,
      });
      expect(res.status).toBe(404);
    }
    expect(await prisma.creditLedger.count({ where: { type: "ADJUSTMENT" } })).toBe(0);
  });

  it("reserve a l'admin (senior, aidant, prof : 403)", async () => {
    const senior = await createUser("SENIOR");
    const aidant = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const prof = await createUser("TEACHER");
    for (const user of [senior, aidant, prof]) {
      const res = await (await loginAs(user)).post("/api/admin/credits/adjustments").send({
        seniorId: senior.id, amount: 5, afterRefund: false, adminNote: NOTE,
      });
      expect(res.status).toBe(403);
    }
    expect(await solde(senior.id)).toBe(0);
  });
});

describe("historique : note et reference restent cote admin", () => {
  it("le senior voit le libelle, jamais la note ni la reference", async () => {
    const { senior, agent } = await adminEtSenior(5);
    await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: -1, afterRefund: true, externalReference: "re_AbC123", adminNote: NOTE,
    });

    const res = await (await loginAs(senior)).get("/api/credits/history");

    const brut = JSON.stringify(res.body);
    expect(brut).not.toContain("re_AbC123");
    expect(brut).not.toContain(NOTE);
    expect(res.body.map((e: { reason: string }) => e.reason)).toContain("Achat remboursé — crédits retirés");
  });

  it("l'admin voit qui, la reference et la note", async () => {
    const { admin, senior, agent } = await adminEtSenior(5);
    await agent.post("/api/admin/credits/adjustments").send({
      seniorId: senior.id, amount: -1, afterRefund: true, externalReference: "re_AbC123", adminNote: NOTE,
    });

    const res = await agent.get(`/api/admin/credits/ledger?seniorId=${senior.id}`);

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      type: "ADJUSTMENT", amount: -1, externalReference: "re_AbC123", adminNote: NOTE,
      triggeredByName: `${admin.firstName} ${admin.lastName}`,
    });
  });

  it("l'historique admin est interdit aux autres roles", async () => {
    const senior = await createUser("SENIOR");
    const res = await (await loginAs(senior)).get(`/api/admin/credits/ledger?seniorId=${senior.id}`);
    expect(res.status).toBe(403);
  });
});
