/**
 * Achat de credits en ligne (Stripe Checkout) : creation de session et
 * traitement du webhook de confirmation.
 *
 * Le prix envoye a Stripe et credite au webhook vient toujours de la
 * constante serveur shared/credit-offers.ts, jamais d'une valeur fournie
 * par le client — ces tests verifient que la validation d'offre a lieu
 * avant tout appel au prestataire de paiement.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import Stripe from "stripe";
import { resetDatabase, createUser, loginAs, getApp } from "./helpers";
import { prisma } from "../server/prisma";
import request from "supertest";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/credits/checkout", () => {
  it("refuse une requete non authentifiee", async () => {
    const app = await getApp();
    const res = await request(app).post("/api/credits/checkout").send({ offerId: "pack-5" });
    expect(res.status).toBe(401);
  });

  it("refuse une offre inconnue", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    const res = await agent.post("/api/credits/checkout").send({ offerId: "offre-inexistante" });
    expect(res.status).toBe(400);
  });

  it("refuse un referent sans senior lie", async () => {
    const referent = await createUser("REFERENT_SENIOR");
    const agent = await loginAs(referent);
    const res = await agent.post("/api/credits/checkout").send({ offerId: "pack-5" });
    expect(res.status).toBe(400);
  });

  it("cree une session pour un senior directement (mock reseau Stripe absent : verifie juste la validation en amont)", async () => {
    // Sans reseau reel vers Stripe, on ne peut pas verifier la creation
    // effective de la session ici (stripe.checkout.sessions.create ferait
    // un appel HTTP reel). Ce test verifie que la resolution du senior et
    // la validation d'offre laissent bien passer la requete jusqu'a l'appel
    // au prestataire, sans erreur de validation prealable.
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    const res = await agent.post("/api/credits/checkout").send({ offerId: "pack-5" });
    // Avec une cle Stripe factice, l'appel reseau echoue (401 cote Stripe) :
    // on verifie que l'echec vient bien de l'appel au prestataire (500)
    // et non d'un rejet de validation (400/401/403).
    expect(res.status).toBe(500);
  });
});

describe("POST /api/webhooks/payment", () => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  function buildSignedRequest(payload: object) {
    const payloadString = JSON.stringify(payload);
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: webhookSecret,
    });
    return { payloadString, header };
  }

  it("rejette une signature invalide", async () => {
    const senior = await createUser("SENIOR");
    const app = await getApp();
    // Metadata completes et valides : si ce test passe malgre une signature
    // fausse, c'est bien la verification de signature qui a echoue a
    // bloquer, pas une validation de contenu en aval.
    const payloadString = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_signature_invalide",
          amount_total: 1500,
          metadata: { seniorId: senior.id, offerId: "pack-1", purchasedByUserId: senior.id },
        },
      },
    });
    const res = await request(app)
      .post("/api/webhooks/payment")
      .set("stripe-signature", "signature-invalide")
      .set("Content-Type", "application/json")
      .send(payloadString);
    expect(res.status).toBe(400);

    const payment = await prisma.paymentRecord.findUnique({ where: { stripeSessionId: "cs_test_signature_invalide" } });
    expect(payment).toBeNull();
  });

  it("traite un evenement checkout.session.completed valide et cree les credits", async () => {
    const senior = await createUser("SENIOR");
    const app = await getApp();

    const sessionPayload = {
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_session_1",
          amount_total: 6500,
          metadata: {
            seniorId: senior.id,
            offerId: "pack-5",
            purchasedByUserId: senior.id,
          },
        },
      },
    };
    const { payloadString, header } = buildSignedRequest(sessionPayload);

    const res = await request(app)
      .post("/api/webhooks/payment")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(payloadString);

    expect(res.status).toBe(200);

    const payment = await prisma.paymentRecord.findUnique({ where: { stripeSessionId: "cs_test_session_1" } });
    expect(payment).not.toBeNull();
    expect(payment?.amount).toBe(65);

    const ledger = await prisma.creditLedger.findFirst({ where: { seniorId: senior.id, type: "PURCHASE" } });
    expect(ledger?.amount).toBe(5);
  });

  it("ignore un rejeu du meme evenement sans creer de doublon ni tenter de reecrire en base", async () => {
    const senior = await createUser("SENIOR");
    const app = await getApp();

    const sessionPayload = {
      id: "evt_test_2",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_session_2",
          amount_total: 1500,
          metadata: {
            seniorId: senior.id,
            offerId: "pack-1",
            purchasedByUserId: senior.id,
          },
        },
      },
    };
    const { payloadString, header } = buildSignedRequest(sessionPayload);

    const premier = await request(app)
      .post("/api/webhooks/payment")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(payloadString);
    expect(premier.status).toBe(200);

    // Sans le check d'idempotence applicatif, ce second appel tenterait de
    // recreer un PaymentRecord avec le meme stripeSessionId : la contrainte
    // unique le bloquerait en base, mais l'exception Prisma remonterait et
    // serait logguee comme une erreur de traitement — signal que le check
    // en amont n'a pas fonctionne, meme si le resultat visible (200, pas de
    // doublon) est identique de l'exterieur.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const second = await request(app)
      .post("/api/webhooks/payment")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(payloadString);
    expect(second.status).toBe(200);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();

    const paiements = await prisma.paymentRecord.count({ where: { stripeSessionId: "cs_test_session_2" } });
    expect(paiements).toBe(1);

    const mouvements = await prisma.creditLedger.count({ where: { seniorId: senior.id, type: "PURCHASE" } });
    expect(mouvements).toBe(1);
  });
});
