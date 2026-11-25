/**
 * Achat de credits en ligne (Mollie) : creation du paiement, webhook, et page
 * de retour (checkout-status).
 *
 * fetch est remplace par un faux Mollie en memoire : toute la chaine est
 * testee (route -> mollie-provider -> appels HTTP), sans reseau.
 *
 * Points de securite verifies :
 * - le prix envoye a Mollie vient du serveur, jamais du client ;
 * - le webhook Mollie n'est pas signe : son contenu n'est jamais cru, le
 *   paiement est relu chez Mollie (statut, montant, metadonnees) ;
 * - un paiement n'est credite qu'une fois, meme si le webhook et la page de
 *   retour arrivent ensemble ;
 * - seul l'acheteur voit l'etat de son paiement.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import request from "supertest";
import { resetDatabase, createUser, loginAs, getApp } from "./helpers";
import { prisma } from "../server/prisma";
import { storage } from "../server/storage";
import { env } from "../server/env";
import { sendEmail } from "../server/lib/email";

const MOLLIE = "https://api.mollie.com/v2";

interface FakePayment {
  id: string;
  status: string;
  amount: { currency: string; value: string };
  amountRefunded?: { currency: string; value: string };
  metadata: unknown;
  redirectUrl?: string;
  webhookUrl?: string;
  _links: { checkout: { href: string } };
}

const mollie = {
  payments: new Map<string, FakePayment>(),
  calls: [] as { method: string; path: string; body: any; auth: string | undefined }[],
  down: false,
  counter: 0,
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const fakeFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith(MOLLIE)) throw new Error(`fetch inattendu dans les tests : ${url}`);
  const method = init?.method ?? "GET";
  const path = url.slice(MOLLIE.length);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
  mollie.calls.push({ method, path, body, auth });

  if (mollie.down) return json({ status: 503, title: "Service Unavailable" }, 503);

  if (method === "POST" && path === "/payments") {
    const id = `tr_fake${++mollie.counter}`;
    const payment: FakePayment = {
      id,
      status: "open",
      amount: body.amount,
      metadata: body.metadata,
      redirectUrl: body.redirectUrl,
      webhookUrl: body.webhookUrl,
      _links: { checkout: { href: `https://www.mollie.com/checkout/${id}` } },
    };
    mollie.payments.set(id, payment);
    return json(payment, 201);
  }

  const match = path.match(/^\/payments\/([^/]+)$/);
  const payment = match ? mollie.payments.get(match[1]) : undefined;
  if (!payment) return json({ status: 404, title: "Not Found" }, 404);
  if (method === "PATCH") Object.assign(payment, body);
  return json(payment);
});

/** A payment as Mollie would hold it after our checkout created it. */
function paiementMollie(
  id: string,
  status: string,
  meta: { seniorId: string; purchasedByUserId?: string; offerId?: string } | null,
  value = "18.00",
) {
  mollie.payments.set(id, {
    id,
    status,
    amount: { currency: "EUR", value },
    metadata: meta && {
      seniorId: meta.seniorId,
      offerId: meta.offerId ?? "pack-1",
      purchasedByUserId: meta.purchasedByUserId ?? meta.seniorId,
    },
    _links: { checkout: { href: `https://www.mollie.com/checkout/${id}` } },
  });
}

async function webhook(id: string) {
  // Mollie posts a form, not JSON.
  return request(await getApp()).post("/api/webhooks/payment").type("form").send(`id=${id}`);
}

const achats = (seniorId: string) => prisma.creditLedger.count({ where: { seniorId, type: "PURCHASE" } });
const alertes = () => prisma.report.findMany({ where: { reason: "PAYMENT_NOT_CREDITED" } });

beforeEach(async () => {
  await resetDatabase();
  mollie.payments.clear();
  mollie.calls = [];
  mollie.down = false;
  vi.stubGlobal("fetch", fakeFetch);
  vi.mocked(sendEmail).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/credits/checkout", () => {
  it("refuse une requete non authentifiee", async () => {
    const res = await request(await getApp()).post("/api/credits/checkout").send({ offerId: "pack-5" });
    expect(res.status).toBe(401);
    expect(mollie.calls).toHaveLength(0);
  });

  it("refuse une offre inconnue sans appeler Mollie", async () => {
    const agent = await loginAs(await createUser("SENIOR"));
    const res = await agent.post("/api/credits/checkout").send({ offerId: "offre-inexistante" });
    expect(res.status).toBe(400);
    expect(mollie.calls).toHaveLength(0);
  });

  it("refuse un referent sans senior lie", async () => {
    const agent = await loginAs(await createUser("REFERENT_SENIOR"));
    const res = await agent.post("/api/credits/checkout").send({ offerId: "pack-5" });
    expect(res.status).toBe(400);
    expect(mollie.calls).toHaveLength(0);
  });

  it("cree le paiement Mollie au prix serveur et renvoie la page de paiement", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);

    // A client-supplied price must be ignored: only offerId is read.
    const res = await agent.post("/api/credits/checkout").send({ offerId: "pack-10", priceEuros: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: "https://www.mollie.com/checkout/tr_fake1" });

    const creation = mollie.calls[0];
    expect(creation.method).toBe("POST");
    expect(creation.auth).toBe(`Bearer ${process.env.MOLLIE_API_KEY}`);
    expect(creation.body.amount).toEqual({ currency: "EUR", value: "160.00" });
    expect(creation.body.metadata).toEqual({ seniorId: senior.id, offerId: "pack-10", purchasedByUserId: senior.id });
    expect(creation.body.cancelUrl).toBe("http://localhost:5000/credits/cancel");
    // BASE_URL is localhost in tests: Mollie could not reach a webhook.
    expect(creation.body).not.toHaveProperty("webhookUrl");

    // The id is added to the return URL once known, for the success page.
    expect(mollie.payments.get("tr_fake1")?.redirectUrl).toBe(
      "http://localhost:5000/credits/success?payment_id=tr_fake1",
    );
  });

  it("le referent achete pour son senior : credits au senior, paiement au referent", async () => {
    const senior = await createUser("SENIOR");
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });

    const res = await (await loginAs(referent)).post("/api/credits/checkout").send({ offerId: "pack-1" });

    expect(res.status).toBe(200);
    expect(mollie.calls[0].body.metadata).toEqual({ seniorId: senior.id, offerId: "pack-1", purchasedByUserId: referent.id });
  });

  it("donne le webhook a Mollie quand le site est public", async () => {
    const before = env.BASE_URL;
    env.BASE_URL = "https://lyannaj.example";
    try {
      const agent = await loginAs(await createUser("SENIOR"));
      await agent.post("/api/credits/checkout").send({ offerId: "pack-1" });
      expect(mollie.calls[0].body.webhookUrl).toBe("https://lyannaj.example/api/webhooks/payment");
    } finally {
      env.BASE_URL = before;
    }
  });

  it("repond 500 si Mollie est indisponible", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mollie.down = true;
    const agent = await loginAs(await createUser("SENIOR"));
    const res = await agent.post("/api/credits/checkout").send({ offerId: "pack-1" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/webhooks/payment (Mollie, non signe)", () => {
  it("rejette un appel sans identifiant de paiement valide", async () => {
    const app = await getApp();
    expect((await request(app).post("/api/webhooks/payment").type("form").send("foo=bar")).status).toBe(400);
    expect((await webhook("../../v2/methods")).status).toBe(400);
    expect(mollie.calls).toHaveLength(0);
  });

  it("credite un paiement paye en relisant Mollie, et previent le senior", async () => {
    const senior = await createUser("SENIOR");
    paiementMollie("tr_paye", "paid", { seniorId: senior.id, offerId: "pack-5" }, "85.00");

    const res = await webhook("tr_paye");

    expect(res.status).toBe(200);
    expect(mollie.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /payments/tr_paye"]);
    const payment = await prisma.paymentRecord.findUnique({ where: { externalPaymentId: "tr_paye" } });
    expect(payment?.amount).toBe(85);
    expect(payment?.userId).toBe(senior.id);
    const ledger = await prisma.creditLedger.findFirst({ where: { seniorId: senior.id, type: "PURCHASE" } });
    expect(ledger?.amount).toBe(5);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("un achat du referent previent le senior et le referent", async () => {
    const senior = await createUser("SENIOR");
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    paiementMollie("tr_referent", "paid", { seniorId: senior.id, purchasedByUserId: referent.id });

    await webhook("tr_referent");

    expect(await achats(senior.id)).toBe(1);
    const destinataires = vi.mocked(sendEmail).mock.calls.map((c) => c[0].to).sort();
    expect(destinataires).toEqual([senior.email, referent.email].sort());
  });

  it("un identifiant inconnu de Mollie : 200, rien n'est credite", async () => {
    const res = await webhook("tr_inconnu");
    expect(res.status).toBe(200);
    expect(await prisma.paymentRecord.count()).toBe(0);
  });

  it("un paiement pas encore paye n'est pas credite, il l'est quand Mollie rappelle une fois paye", async () => {
    const senior = await createUser("SENIOR");
    paiementMollie("tr_enCours", "open", { seniorId: senior.id });

    expect((await webhook("tr_enCours")).status).toBe(200);
    expect(await achats(senior.id)).toBe(0);

    mollie.payments.get("tr_enCours")!.status = "paid";
    expect((await webhook("tr_enCours")).status).toBe(200);
    expect(await achats(senior.id)).toBe(1);
  });

  it("un paiement annule ou expire n'est jamais credite", async () => {
    const senior = await createUser("SENIOR");
    paiementMollie("tr_annule", "canceled", { seniorId: senior.id });
    paiementMollie("tr_expire", "expired", { seniorId: senior.id });

    await webhook("tr_annule");
    await webhook("tr_expire");

    expect(await prisma.paymentRecord.count()).toBe(0);
  });

  it("un paiement sans nos metadonnees (pas cree par Lyannaj) est ignore", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    paiementMollie("tr_etranger", "paid", null);
    expect((await webhook("tr_etranger")).status).toBe(200);
    expect(await prisma.paymentRecord.count()).toBe(0);
  });

  it("un montant different du prix de l'offre n'est pas credite et l'equipe est prevenue une seule fois", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    paiementMollie("tr_montant", "paid", { seniorId: senior.id, offerId: "pack-10" }, "1.00");

    expect((await webhook("tr_montant")).status).toBe(200);
    // Same problem met again by a replay and by the success page.
    await webhook("tr_montant");
    expect((await agent.get("/api/credits/checkout-status?paymentId=tr_montant")).body).toEqual({ status: "processing" });

    expect(await achats(senior.id)).toBe(0);
    const reports = await alertes();
    expect(reports).toHaveLength(1);
    expect(reports[0].reporterId).toBe(senior.id);
    expect(reports[0].message).toContain("tr_montant");
    expect(reports[0].message).toContain("montant inattendu");
  });

  it("un paiement deja rembourse n'est jamais credite (webhook rejoue apres un remboursement)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const senior = await createUser("SENIOR");
    paiementMollie("tr_rembourse", "paid", { seniorId: senior.id });
    // Mollie keeps status "paid" after a refund.
    mollie.payments.get("tr_rembourse")!.amountRefunded = { currency: "EUR", value: "18.00" };

    expect((await webhook("tr_rembourse")).status).toBe(200);

    expect(await achats(senior.id)).toBe(0);
  });

  it("un paiement autorise mais pas encore encaisse n'est pas credite", async () => {
    const senior = await createUser("SENIOR");
    paiementMollie("tr_autorise", "authorized", { seniorId: senior.id });

    expect((await webhook("tr_autorise")).status).toBe(200);

    expect(await achats(senior.id)).toBe(0);
  });

  it("un rejeu ne credite pas deux fois et ne logue aucune erreur", async () => {
    const senior = await createUser("SENIOR");
    paiementMollie("tr_rejeu", "paid", { seniorId: senior.id });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await webhook("tr_rejeu")).status).toBe(200);
    expect((await webhook("tr_rejeu")).status).toBe(200);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(await prisma.paymentRecord.count({ where: { externalPaymentId: "tr_rejeu" } })).toBe(1);
    expect(await achats(senior.id)).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("repond 500 si Mollie est injoignable (Mollie reessaiera), puis credite une seule fois", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const senior = await createUser("SENIOR");
    paiementMollie("tr_panneMollie", "paid", { seniorId: senior.id });

    mollie.down = true;
    expect((await webhook("tr_panneMollie")).status).toBe(500);
    mollie.down = false;
    expect((await webhook("tr_panneMollie")).status).toBe(200);

    expect(await achats(senior.id)).toBe(1);
  });

  it("repond 500 sur une panne de base pour que Mollie reessaie, puis credite une seule fois", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const senior = await createUser("SENIOR");
    paiementMollie("tr_panneBase", "paid", { seniorId: senior.id });
    vi.spyOn(storage, "createPayment").mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));

    expect((await webhook("tr_panneBase")).status).toBe(500);
    expect(await achats(senior.id)).toBe(0);
    expect((await webhook("tr_panneBase")).status).toBe(200);
    expect(await achats(senior.id)).toBe(1);
  });

  it("repond 200 sans crediter si le senior a ete supprime (rejouer n'y changerait rien)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const senior = await createUser("SENIOR");
    const payeur = await createUser("REFERENT_SENIOR");
    paiementMollie("tr_seniorSupprime", "paid", { seniorId: senior.id, purchasedByUserId: payeur.id });
    await prisma.user.delete({ where: { id: senior.id } });

    expect((await webhook("tr_seniorSupprime")).status).toBe(200);

    expect(await prisma.paymentRecord.count({ where: { externalPaymentId: "tr_seniorSupprime" } })).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Remboursement manuel"));
    const reports = await alertes();
    expect(reports).toHaveLength(1);
    expect(reports[0].reporterId).toBe(payeur.id);
  });

  it("payeur et senior supprimes : l'alerte est rattachee a un admin", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = await createUser("ADMIN");
    const senior = await createUser("SENIOR");
    paiementMollie("tr_toutSupprime", "paid", { seniorId: senior.id });
    await prisma.user.delete({ where: { id: senior.id } });

    expect((await webhook("tr_toutSupprime")).status).toBe(200);

    const reports = await alertes();
    expect(reports).toHaveLength(1);
    expect(reports[0].reporterId).toBe(admin.id);
  });

  it("si la verification prealable rate un credit deja fait, la contrainte unique empeche le double credit", async () => {
    // Forces the path where both callers passed the "already recorded?" check
    // (the real race): the second insert hits the unique payment id.
    const senior = await createUser("SENIOR");
    paiementMollie("tr_unique", "paid", { seniorId: senior.id });
    vi.spyOn(storage, "getPaymentByExternalId").mockResolvedValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await webhook("tr_unique")).status).toBe(200);
    expect((await webhook("tr_unique")).status).toBe(200);

    expect(await achats(senior.id)).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/credits/checkout-status (page de retour)", () => {
  const statut = (agent: Awaited<ReturnType<typeof loginAs>>, id: string) =>
    agent.get(`/api/credits/checkout-status?paymentId=${encodeURIComponent(id)}`);

  it("refuse un identifiant mal forme", async () => {
    const agent = await loginAs(await createUser("SENIOR"));
    expect((await statut(agent, "../../etc")).status).toBe(400);
    expect((await statut(agent, "cs_test_abc")).status).toBe(400);
    expect(mollie.calls).toHaveLength(0);
  });

  it("paye chez Mollie sans webhook recu (dev local) : credite au retour, une seule fois", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    paiementMollie("tr_retour", "paid", { seniorId: senior.id });

    expect((await statut(agent, "tr_retour")).body).toEqual({ status: "credited" });
    expect((await statut(agent, "tr_retour")).body).toEqual({ status: "credited" });

    expect(await achats(senior.id)).toBe(1);
    // Second poll answered from the base, without calling Mollie again.
    expect(mollie.calls).toHaveLength(1);
  });

  it("parti de Mollie sans payer : unpaid ; en confirmation : processing ; refuse : failed", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    // "Page precedente" on Mollie sends the payer back here, payment still open.
    paiementMollie("tr_ouvert", "open", { seniorId: senior.id });
    paiementMollie("tr_enConfirmation", "pending", { seniorId: senior.id });
    paiementMollie("tr_refuse", "failed", { seniorId: senior.id });

    expect((await statut(agent, "tr_ouvert")).body).toEqual({ status: "unpaid" });
    expect((await statut(agent, "tr_enConfirmation")).body).toEqual({ status: "processing" });
    expect((await statut(agent, "tr_refuse")).body).toEqual({ status: "failed" });
    expect(await prisma.paymentRecord.count()).toBe(0);
  });

  it("un autre utilisateur n'apprend rien du paiement et ne le credite pas", async () => {
    const acheteur = await createUser("SENIOR");
    const autre = await loginAs(await createUser("SENIOR"));
    paiementMollie("tr_aAutrui", "paid", { seniorId: acheteur.id });
    paiementMollie("tr_refuseAutrui", "canceled", { seniorId: acheteur.id });

    expect((await statut(autre, "tr_aAutrui")).body).toEqual({ status: "processing" });
    expect((await statut(autre, "tr_refuseAutrui")).body).toEqual({ status: "processing" });
    expect(await prisma.paymentRecord.count()).toBe(0);
  });

  it("deja credite par le webhook : l'autre utilisateur ne le voit pas, l'acheteur oui", async () => {
    const acheteur = await createUser("SENIOR");
    paiementMollie("tr_deja", "paid", { seniorId: acheteur.id });
    await webhook("tr_deja");

    const autre = await loginAs(await createUser("SENIOR"));
    expect((await statut(autre, "tr_deja")).body).toEqual({ status: "processing" });
    expect((await statut(await loginAs(acheteur), "tr_deja")).body).toEqual({ status: "credited" });
  });

  it("webhook et page de retour en meme temps : un seul credit, un seul e-mail", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    paiementMollie("tr_course", "paid", { seniorId: senior.id });

    const [hook, page] = await Promise.all([webhook("tr_course"), statut(agent, "tr_course")]);

    expect(hook.status).toBe(200);
    expect(page.body).toEqual({ status: "credited" });
    expect(await achats(senior.id)).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
