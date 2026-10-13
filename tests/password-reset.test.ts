/**
 * Mot de passe oublie : demande de lien et reinitialisation.
 *
 * Le jeton en clair n'est jamais en base (seule son empreinte l'est) : les
 * tests l'obtiennent via createPasswordResetToken, comme le fait la route.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs, anonymousAgent, MOT_DE_PASSE_TEST } from "./helpers";
import { prisma } from "../server/prisma";
import { createPasswordResetToken } from "../server/lib/password-reset";

const NOUVEAU = "NouveauMotDePasse456!";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/forgot-password", () => {
  it("cree un jeton pour un compte actif, sans le stocker en clair", async () => {
    const user = await createUser("SENIOR");
    const agent = await anonymousAgent();

    const res = await agent.post("/api/auth/forgot-password").send({ email: user.email.toUpperCase() });

    expect(res.status).toBe(200);
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("repond pareil pour un email inconnu, sans rien creer", async () => {
    const user = await createUser("SENIOR");
    const agent = await anonymousAgent();

    const connu = await agent.post("/api/auth/forgot-password").send({ email: user.email });
    const inconnu = await agent.post("/api/auth/forgot-password").send({ email: "personne@test.local" });

    expect(inconnu.status).toBe(connu.status);
    expect(inconnu.body).toEqual(connu.body);
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });

  it("n'envoie rien a un compte non actif", async () => {
    await createUser("JUNIOR", { status: "PENDING_VALIDATION", email: "attente@test.local" });
    await createUser("JUNIOR", { status: "SUSPENDED", email: "suspendu@test.local" });
    const agent = await anonymousAgent();

    await agent.post("/api/auth/forgot-password").send({ email: "attente@test.local" });
    await agent.post("/api/auth/forgot-password").send({ email: "suspendu@test.local" });

    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("une nouvelle demande annule le lien precedent", async () => {
    const user = await createUser("SENIOR");
    const ancien = await createPasswordResetToken(user.id);
    await createPasswordResetToken(user.id);

    const res = await (await anonymousAgent())
      .post("/api/auth/reset-password")
      .send({ token: ancien, password: NOUVEAU });

    expect(res.status).toBe(400);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it("refuse un email mal forme", async () => {
    const res = await (await anonymousAgent()).post("/api/auth/forgot-password").send({ email: "pas-un-email" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("change le mot de passe : le nouveau marche, l'ancien non", async () => {
    const user = await createUser("SENIOR");
    const token = await createPasswordResetToken(user.id);
    const agent = await anonymousAgent();

    const res = await agent.post("/api/auth/reset-password").send({ token, password: NOUVEAU });
    expect(res.status).toBe(200);

    const ancien = await agent.post("/api/auth/login").send({ email: user.email, password: MOT_DE_PASSE_TEST });
    expect(ancien.status).toBe(401);
    const nouveau = await agent.post("/api/auth/login").send({ email: user.email, password: NOUVEAU });
    expect(nouveau.status).toBe(200);
  });

  it("le lien ne sert qu'une fois", async () => {
    const user = await createUser("SENIOR");
    const token = await createPasswordResetToken(user.id);
    const agent = await anonymousAgent();

    await agent.post("/api/auth/reset-password").send({ token, password: NOUVEAU });
    const second = await agent.post("/api/auth/reset-password").send({ token, password: "EncoreUnAutre789!" });

    expect(second.status).toBe(400);
    expect(second.body.reason).toBe("invalid");
  });

  it("deux soumissions simultanees du meme lien : une seule passe", async () => {
    const user = await createUser("SENIOR");
    const token = await createPasswordResetToken(user.id);
    const agent = await anonymousAgent();

    const [a, b] = await Promise.all([
      agent.post("/api/auth/reset-password").send({ token, password: "PremierEssai111!" }),
      agent.post("/api/auth/reset-password").send({ token, password: "SecondEssai222!" }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 400]);
  });

  it("refuse un lien expire", async () => {
    const user = await createUser("SENIOR");
    const token = await createPasswordResetToken(user.id);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await (await anonymousAgent())
      .post("/api/auth/reset-password")
      .send({ token, password: NOUVEAU });

    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("expired");
  });

  it("refuse un jeton inconnu et un mot de passe trop court", async () => {
    const user = await createUser("SENIOR");
    const token = await createPasswordResetToken(user.id);
    const agent = await anonymousAgent();

    const inconnu = await agent.post("/api/auth/reset-password").send({ token: "inexistant", password: NOUVEAU });
    expect(inconnu.status).toBe(400);
    expect(inconnu.body.reason).toBe("invalid");

    const court = await agent.post("/api/auth/reset-password").send({ token, password: "123" });
    expect(court.status).toBe(400);
    // Le jeton n'a pas ete consomme par la tentative refusee.
    const record = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(record.usedAt).toBeNull();
  });

  it("ferme les sessions ouvertes du compte", async () => {
    const user = await createUser("SENIOR");
    const connecte = await loginAs(user);
    expect((await connecte.get("/api/auth/me")).status).toBe(200);

    const token = await createPasswordResetToken(user.id);
    await (await anonymousAgent()).post("/api/auth/reset-password").send({ token, password: NOUVEAU });

    expect((await connecte.get("/api/auth/me")).status).toBe(401);
  });

  it("ne touche pas aux sessions des autres comptes", async () => {
    const user = await createUser("SENIOR");
    const autre = await createUser("JUNIOR");
    const autreAgent = await loginAs(autre);

    const token = await createPasswordResetToken(user.id);
    await (await anonymousAgent()).post("/api/auth/reset-password").send({ token, password: NOUVEAU });

    expect((await autreAgent.get("/api/auth/me")).status).toBe(200);
  });
});
