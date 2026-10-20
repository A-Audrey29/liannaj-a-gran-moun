/**
 * Demande de suppression de compte.
 *
 * Rien n'est supprime par la route : elle depose une demande chez les admins
 * (onglet Signalements + e-mail). La confirmation ("les ateliers non utilises
 * seront perdus") est exigee cote serveur aussi, et un double clic ne cree pas
 * deux demandes.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import { resetDatabase, createUser, loginAs, anonymousAgent, crediterSenior } from "./helpers";
import { prisma } from "../server/prisma";
import { sendEmail } from "../server/lib/email";

const URL = "/api/account/deletion-request";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(sendEmail).mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function demandes() {
  return prisma.report.findMany({ where: { reason: "ACCOUNT_DELETION" } });
}

describe("POST /api/account/deletion-request", () => {
  it("refuse un visiteur non connecte", async () => {
    const agent = await anonymousAgent();
    const res = await agent.post(URL).send({ confirmed: true });
    expect(res.status).toBe(401);
    expect(await demandes()).toHaveLength(0);
  });

  it("exige la confirmation explicite (corps vide, false ou autre type)", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    for (const body of [{}, { confirmed: false }, { confirmed: "true" }, { confirmed: 1 }]) {
      const res = await agent.post(URL).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(await demandes()).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuse un administrateur", async () => {
    const admin = await createUser("ADMIN");
    const agent = await loginAs(admin);
    const res = await agent.post(URL).send({ confirmed: true });
    expect(res.status).toBe(403);
    expect(await demandes()).toHaveLength(0);
  });

  it("depose la demande d'un senior avec son solde et previent les admins", async () => {
    const admin = await createUser("ADMIN");
    const senior = await createUser("SENIOR", { firstName: "Jean", lastName: "Dupont" });
    await crediterSenior(senior.id, 3);
    const agent = await loginAs(senior);

    const res = await agent.post(URL).send({ confirmed: true });
    expect(res.status).toBe(201);

    const [demande] = await demandes();
    expect(demande.reporterId).toBe(senior.id);
    expect(demande.status).toBe("OPEN");
    expect(demande.message).toContain("Jean Dupont");
    expect(demande.message).toContain(senior.email);
    expect(demande.message).toContain("Ateliers non utilisés : 3");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe(admin.email);
    expect(mail.subject).toContain("suppression de compte");
    // Rien n'est supprime : le compte existe toujours et reste actif.
    const encore = await prisma.user.findUnique({ where: { id: senior.id } });
    expect(encore?.status).toBe("ACTIVE");
  });

  it("n'accumule pas les demandes : un second envoi renvoie la premiere", async () => {
    await createUser("ADMIN");
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);

    expect((await agent.post(URL).send({ confirmed: true })).status).toBe(201);
    const second = await agent.post(URL).send({ confirmed: true });
    expect(second.status).toBe(200);
    expect(second.body.alreadyRequested).toBe(true);

    expect(await demandes()).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("accepte une nouvelle demande une fois la precedente traitee", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    await agent.post(URL).send({ confirmed: true });
    await prisma.report.updateMany({ where: { reporterId: senior.id }, data: { status: "HANDLED" } });

    expect((await agent.post(URL).send({ confirmed: true })).status).toBe(201);
    expect(await demandes()).toHaveLength(2);
  });

  it("un jeune ou un aidant peut demander aussi, sans mention de solde", async () => {
    for (const role of ["JUNIOR", "REFERENT_SENIOR"] as const) {
      const user = await createUser(role);
      const agent = await loginAs(user);
      const res = await agent.post(URL).send({ confirmed: true });
      expect(res.status, role).toBe(201);
      const demande = (await demandes()).find((d) => d.reporterId === user.id)!;
      expect(demande.message).not.toContain("Ateliers non utilisés");
    }
  });

  it("deux envois simultanes ne creent qu'une demande et un seul e-mail", async () => {
    await createUser("ADMIN");
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);

    const reponses = await Promise.all([1, 2, 3].map(() => agent.post(URL).send({ confirmed: true })));
    expect(reponses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(reponses.filter((r) => r.body.alreadyRequested)).toHaveLength(2);
    expect(await demandes()).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("echappe le prenom dans l'e-mail envoye aux admins", async () => {
    await createUser("ADMIN");
    const senior = await createUser("SENIOR", { firstName: "<img src=x onerror=alert(1)>" });
    await (await loginAs(senior)).post(URL).send({ confirmed: true });

    const html = vi.mocked(sendEmail).mock.calls[0][0].htmlContent as string;
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("un professeur peut demander aussi", async () => {
    const prof = await createUser("TEACHER");
    expect((await (await loginAs(prof)).post(URL).send({ confirmed: true })).status).toBe(201);
  });

  it("GET indique si une demande est en attente, par utilisateur", async () => {
    const a = await createUser("SENIOR");
    const b = await createUser("SENIOR");
    const agentA = await loginAs(a);
    expect((await agentA.get(URL)).body).toEqual({ pending: false });
    await agentA.post(URL).send({ confirmed: true });
    expect((await agentA.get(URL)).body).toEqual({ pending: true });
    expect((await (await loginAs(b)).get(URL)).body).toEqual({ pending: false });
    expect((await (await anonymousAgent()).get(URL)).status).toBe(401);
  });

  it("l'admin ne recoit jamais le hash du mot de passe dans les signalements", async () => {
    const admin = await createUser("ADMIN");
    const senior = await createUser("SENIOR");
    await (await loginAs(senior)).post(URL).send({ confirmed: true });

    const res = await (await loginAs(admin)).get("/api/admin/reports");
    const brut = JSON.stringify(res.body);
    expect(brut).not.toContain("password");
    expect(brut).not.toContain("validationToken");
    expect(res.body[0].reporter.email).toBe(senior.email);
  });

  it("la demande apparait dans les signalements de l'admin", async () => {
    const admin = await createUser("ADMIN");
    const senior = await createUser("SENIOR");
    await (await loginAs(senior)).post(URL).send({ confirmed: true });

    const res = await (await loginAs(admin)).get("/api/admin/reports");
    expect(res.status).toBe(200);
    expect(res.body.some((r: any) => r.reason === "ACCOUNT_DELETION")).toBe(true);
  });
});
