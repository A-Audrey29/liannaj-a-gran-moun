/**
 * Routes de lecture des credits et suivi d'un paiement.
 *
 * - Qui lit quel solde : le senior le sien, le referent celui de son senior,
 *   l'admin celui d'un senior designe (?seniorId=), personne d'autre.
 * - Le solde expose aussi les credits disponibles (solde - ateliers payants
 *   deja prevus).
 * - L'historique ne renvoie aucun identifiant interne.
 * - checkout-status : la page de succes attend que le webhook ait credite,
 *   et seul l'acheteur voit l'etat de sa session.
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

describe("GET /api/credits/balance", () => {
  it("renvoie le solde et les credits disponibles (ateliers prevus deduits)", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id);
    await crediterSenior(senior.id, 3);
    await prisma.intervention.create({
      data: { relationId: relation.id, status: "CONFIRMED", scheduledDate: new Date("2026-06-15T14:00:00Z") },
    });

    const res = await (await loginAs(senior)).get("/api/credits/balance");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: 3, available: 2 });
  });

  it("le referent lit le solde de son senior", async () => {
    const senior = await createUser("SENIOR");
    await crediterSenior(senior.id, 2);
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });

    const res = await (await loginAs(referent)).get("/api/credits/balance");

    expect(res.body.balance).toBe(2);
  });

  it("un jeune n'a pas de solde (403)", async () => {
    const junior = await createUser("JUNIOR");
    expect((await (await loginAs(junior)).get("/api/credits/balance")).status).toBe(403);
  });

  it("un jeune ne peut pas lire le solde d'un senior via ?seniorId=", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const res = await (await loginAs(junior)).get(`/api/credits/balance?seniorId=${senior.id}`);
    expect(res.status).toBe(403);
  });

  it("l'admin recoit 404 pour un senior inconnu ou un non-senior, au lieu d'un solde 0", async () => {
    const admin = await createUser("ADMIN");
    const junior = await createUser("JUNIOR");
    const agent = await loginAs(admin);

    expect((await agent.get("/api/credits/balance?seniorId=inconnu")).status).toBe(404);
    expect((await agent.get(`/api/credits/balance?seniorId=${junior.id}`)).status).toBe(404);
    expect((await agent.get("/api/credits/balance")).status).toBe(404);
  });
});

describe("GET /api/credits/history", () => {
  it("ne renvoie que type, montant, motif et date", async () => {
    const senior = await createUser("SENIOR");
    await crediterSenior(senior.id, 2);

    const res = await (await loginAs(senior)).get("/api/credits/history");

    expect(res.status).toBe(200);
    expect(Object.keys(res.body[0]).sort()).toEqual(["amount", "createdAt", "id", "reason", "type"]);
  });
});

describe("GET /api/credits/checkout-status", () => {
  async function paiement(userId: string, sessionId: string) {
    return prisma.paymentRecord.create({
      data: { userId, amount: 15, label: "Pack 1", stripeSessionId: sessionId },
    });
  }

  it("credited=true une fois le paiement enregistre pour l'acheteur", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);

    const avant = await agent.get("/api/credits/checkout-status?sessionId=cs_test_abc");
    await paiement(senior.id, "cs_test_abc");
    const apres = await agent.get("/api/credits/checkout-status?sessionId=cs_test_abc");

    expect(avant.body).toEqual({ credited: false });
    expect(apres.body).toEqual({ credited: true });
  });

  it("un autre utilisateur ne voit pas l'etat de la session", async () => {
    const acheteur = await createUser("SENIOR");
    const autre = await createUser("SENIOR");
    await paiement(acheteur.id, "cs_test_xyz");

    const res = await (await loginAs(autre)).get("/api/credits/checkout-status?sessionId=cs_test_xyz");

    expect(res.body).toEqual({ credited: false });
  });

  it("refuse un identifiant de session mal forme", async () => {
    const senior = await createUser("SENIOR");
    const res = await (await loginAs(senior)).get("/api/credits/checkout-status?sessionId=../../etc");
    expect(res.status).toBe(400);
  });
});

describe("abonnement actif", () => {
  it("un achat par le referent marque le senior abonne, pas le referent", async () => {
    const senior = await createUser("SENIOR");
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const admin = await createUser("ADMIN");

    const res = await (await loginAs(admin))
      .post("/api/admin/payments")
      .send({ userId: referent.id, amount: 15, label: "Pack 1", credits: 1 });

    expect(res.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: senior.id } })).subscriptionActive).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: referent.id } })).subscriptionActive).toBe(false);
  });
});
