/**
 * Validation d'inscription et creation de l'espace aidant.
 *
 * La personne de confiance d'un senior valide son inscription via le lien
 * recu par e-mail et peut, dans la meme etape, ouvrir son espace aidant
 * (REFERENT_SENIOR). Ce qui doit tenir :
 *  - le lien e-mail est la seule preuve du lien senior-aidant : l'adresse du
 *    compte aidant est celle qui a recu le lien, jamais celle de la requete ;
 *  - seule l'inscription d'un senior le permet (pas celle d'un jeune) ;
 *  - activation du senior et creation de l'aidant : tout ou rien ;
 *  - un lien deja utilise ne cree pas un second compte.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import crypto from "node:crypto";
import { resetDatabase, createUser, loginAs, anonymousAgent, MOT_DE_PASSE_TEST } from "./helpers";
import { prisma } from "../server/prisma";

const AIDANT_EMAIL = "aidant.proche@test.local";

async function seniorEnAttente(overrides: Record<string, any> = {}) {
  const token = crypto.randomUUID();
  const senior = await createUser("SENIOR", {
    status: "PENDING_VALIDATION",
    validationToken: token,
    validationExpiry: new Date(Date.now() + 60 * 60 * 1000),
    trustedPersonEmail: AIDANT_EMAIL,
    validatorEmail: AIDANT_EMAIL,
    firstName: "Lucienne",
    ...overrides,
  });
  return { senior, token };
}

const aidant = { firstName: "Marie", lastName: "Proche", password: MOT_DE_PASSE_TEST };

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/validate/info", () => {
  it("donne le prenom du senior et l'adresse de l'aidant", async () => {
    const { token } = await seniorEnAttente();
    const res = await (await anonymousAgent()).get(`/api/validate/info?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      firstName: "Lucienne",
      role: "SENIOR",
      aidantEmail: AIDANT_EMAIL,
      canCreateAidant: true,
    });
  });

  it("ne propose pas l'espace aidant si l'adresse a deja un compte", async () => {
    const { token } = await seniorEnAttente();
    await createUser("JUNIOR", { email: AIDANT_EMAIL });
    const res = await (await anonymousAgent()).get(`/api/validate/info?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.canCreateAidant).toBe(false);
  });

  it("ne propose jamais l'espace aidant pour un jeune", async () => {
    const { token } = await seniorEnAttente({ role: "JUNIOR" });
    const res = await (await anonymousAgent()).get(`/api/validate/info?token=${token}`);
    expect(res.body.aidantEmail).toBeNull();
    expect(res.body.canCreateAidant).toBe(false);
  });

  it("refuse un lien inconnu (404) ou expire (410)", async () => {
    const agent = await anonymousAgent();
    expect((await agent.get("/api/validate/info?token=inconnu")).status).toBe(404);
    const { token } = await seniorEnAttente({ validationExpiry: new Date(Date.now() - 1000) });
    const res = await agent.get(`/api/validate/info?token=${token}`);
    expect(res.status).toBe(410);
    expect(res.body.reason).toBe("expired");
  });
});

describe("POST /api/validate avec creation de l'espace aidant", () => {
  it("active le senior et cree l'aidant rattache, qui peut se connecter", async () => {
    const { senior, token } = await seniorEnAttente();
    const res = await (await anonymousAgent()).post("/api/validate").send({ token, aidant });
    expect(res.status).toBe(200);
    expect(res.body.aidantCreated).toBe(true);

    const seniorApres = await prisma.user.findUniqueOrThrow({ where: { id: senior.id } });
    expect(seniorApres.status).toBe("ACTIVE");
    expect(seniorApres.validationToken).toBeNull();

    const cree = await prisma.user.findUniqueOrThrow({ where: { email: AIDANT_EMAIL } });
    expect(cree.role).toBe("REFERENT_SENIOR");
    expect(cree.status).toBe("ACTIVE");
    expect(cree.linkedSeniorId).toBe(senior.id);
    expect(cree.firstName).toBe("Marie");

    const agent = await loginAs({ email: AIDANT_EMAIL });
    const moi = await agent.get("/api/auth/me");
    expect(moi.body.user?.role ?? moi.body.role).toBe("REFERENT_SENIOR");
  });

  it("ignore une adresse e-mail envoyee dans la requete", async () => {
    const { token } = await seniorEnAttente();
    const res = await (await anonymousAgent())
      .post("/api/validate")
      .send({ token, aidant: { ...aidant, email: "intrus@test.local" } });
    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { email: "intrus@test.local" } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: AIDANT_EMAIL } })).not.toBeNull();
  });

  it("refuse pour l'inscription d'un jeune, sans rien valider", async () => {
    const { senior: jeune, token } = await seniorEnAttente({ role: "JUNIOR" });
    const res = await (await anonymousAgent()).post("/api/validate").send({ token, aidant });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("aidant_not_allowed");
    const apres = await prisma.user.findUniqueOrThrow({ where: { id: jeune.id } });
    expect(apres.status).toBe("PENDING_VALIDATION");
    expect(await prisma.user.count({ where: { role: "REFERENT_SENIOR" } })).toBe(0);
  });

  it("409 si l'adresse a deja un compte ; l'inscription reste validable", async () => {
    const { senior, token } = await seniorEnAttente();
    await createUser("JUNIOR", { email: AIDANT_EMAIL });
    const agent = await anonymousAgent();

    const res = await agent.post("/api/validate").send({ token, aidant });
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe("aidant_exists");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: senior.id } })).status).toBe("PENDING_VALIDATION");

    const sansAidant = await agent.post("/api/validate").send({ token });
    expect(sansAidant.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: senior.id } })).status).toBe("ACTIVE");
  });

  it("refuse un mot de passe trop court, sans rien valider", async () => {
    const { senior, token } = await seniorEnAttente();
    const res = await (await anonymousAgent())
      .post("/api/validate")
      .send({ token, aidant: { ...aidant, password: "123" } });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("aidant_invalid");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: senior.id } })).status).toBe("PENDING_VALIDATION");
  });

  it("un lien deja utilise ne cree pas un second compte aidant", async () => {
    const { token } = await seniorEnAttente();
    const agent = await anonymousAgent();
    expect((await agent.post("/api/validate").send({ token, aidant })).status).toBe(200);
    const deuxieme = await agent.post("/api/validate").send({ token, aidant });
    expect(deuxieme.status).toBe(404);
    expect(await prisma.user.count({ where: { role: "REFERENT_SENIOR" } })).toBe(1);
  });

  it("deux validations simultanees ne creent qu'un seul aidant", async () => {
    const { token } = await seniorEnAttente();
    const agent = await anonymousAgent();
    const reponses = await Promise.all([
      agent.post("/api/validate").send({ token, aidant }),
      agent.post("/api/validate").send({ token, aidant }),
    ]);
    expect(reponses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.user.count({ where: { role: "REFERENT_SENIOR" } })).toBe(1);
  });
});

describe("POST /api/validate sans espace aidant (comportement existant)", () => {
  it("valide l'inscription seule", async () => {
    const { senior, token } = await seniorEnAttente();
    const res = await (await anonymousAgent()).post("/api/validate").send({ token });
    expect(res.status).toBe(200);
    expect(res.body.aidantCreated).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: senior.id } })).status).toBe("ACTIVE");
    expect(await prisma.user.count({ where: { role: "REFERENT_SENIOR" } })).toBe(0);
  });

  it("un ancien lien ne reactive pas un compte suspendu", async () => {
    const { senior, token } = await seniorEnAttente({ status: "SUSPENDED" });
    const agent = await anonymousAgent();
    expect((await agent.post("/api/validate").send({ token })).status).toBe(404);
    expect((await agent.post("/api/validate").send({ token, aidant })).status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: senior.id } })).status).toBe("SUSPENDED");
    expect(await prisma.user.count({ where: { role: "REFERENT_SENIOR" } })).toBe(0);
  });

  it("la suspension par l'admin efface le lien de validation", async () => {
    const { senior } = await seniorEnAttente();
    const admin = await loginAs(await createUser("ADMIN"));
    expect((await admin.patch(`/api/admin/users/${senior.id}/suspend`)).status).toBe(200);
    const apres = await prisma.user.findUniqueOrThrow({ where: { id: senior.id } });
    expect(apres.status).toBe("SUSPENDED");
    expect(apres.validationToken).toBeNull();
  });

  it("refuse un token manquant", async () => {
    const res = await (await anonymousAgent()).post("/api/validate").send({});
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("invalid");
  });
});
