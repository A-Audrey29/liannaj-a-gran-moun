/**
 * Authentification et cycle de session.
 *
 * Couvre les regles qui, si elles cassent, ouvrent l'acces a des donnees de
 * mineurs : refus des comptes non valides, non-divulgation de l'existence d'un
 * compte, regeneration de session au login (anti session-fixation) et
 * invalidation reelle a la deconnexion.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import {
  resetDatabase,
  createUser,
  loginAs,
  anonymousAgent,
  getApp,
  MOT_DE_PASSE_TEST,
} from "./helpers";
import { prisma } from "../server/prisma";

/** Extrait la valeur du cookie de session d'une reponse. */
function cookieSession(res: request.Response): string | undefined {
  const entetes = res.headers["set-cookie"];
  const liste = Array.isArray(entetes) ? entetes : entetes ? [entetes] : [];
  return liste.find((c: string) => c.startsWith("connect.sid="));
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/login", () => {
  it("accepte un compte actif avec le bon mot de passe", async () => {
    const user = await createUser("SENIOR");
    const agent = await anonymousAgent();

    const res = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: MOT_DE_PASSE_TEST });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.password).toBeUndefined();
  });

  it("refuse un mot de passe incorrect", async () => {
    const user = await createUser("SENIOR");
    const agent = await anonymousAgent();

    const res = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: "MauvaisMotDePasse123!" });

    expect(res.status).toBe(401);
  });

  it("ne revele pas si l'adresse existe (meme message dans les deux cas)", async () => {
    const user = await createUser("SENIOR");
    const agent = await anonymousAgent();

    const compteExistant = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: "MauvaisMotDePasse123!" });
    const compteInconnu = await agent
      .post("/api/auth/login")
      .send({ email: "inconnu@test.local", password: "MauvaisMotDePasse123!" });

    expect(compteExistant.status).toBe(401);
    expect(compteInconnu.status).toBe(401);
    // Un message different permettrait d'enumerer les comptes de la plateforme.
    expect(compteExistant.body.message).toBe(compteInconnu.body.message);
  });

  it("refuse un compte en attente de validation", async () => {
    const user = await createUser("JUNIOR", { status: "PENDING_VALIDATION" });
    const agent = await anonymousAgent();

    const res = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: MOT_DE_PASSE_TEST });

    expect(res.status).toBe(401);
  });

  it("refuse un compte suspendu", async () => {
    const user = await createUser("JUNIOR", { status: "SUSPENDED" });
    const agent = await anonymousAgent();

    const res = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: MOT_DE_PASSE_TEST });

    expect(res.status).toBe(401);
  });

  it("refuse un compte banni", async () => {
    const user = await createUser("JUNIOR", { status: "BANNED" });
    const agent = await anonymousAgent();

    const res = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: MOT_DE_PASSE_TEST });

    expect(res.status).toBe(401);
  });

  it("accepte une adresse saisie avec une casse differente", async () => {
    const user = await createUser("SENIOR", { email: "casse@test.local" });
    const agent = await anonymousAgent();

    const res = await agent
      .post("/api/auth/login")
      .send({ email: "CASSE@TEST.LOCAL", password: MOT_DE_PASSE_TEST });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it("regenere l'identifiant de session au login (anti session-fixation)", async () => {
    const user = await createUser("SENIOR");
    const app = await getApp();
    const agent = request.agent(app);

    // Premiere requete : le serveur pose une session anonyme.
    const avant = await agent.get("/api/auth/me");
    const cookieAvant = cookieSession(avant);

    const apres = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: MOT_DE_PASSE_TEST });
    const cookieApres = cookieSession(apres);

    expect(apres.status).toBe(200);
    // Un cookie doit etre reemis, et differer de celui d'avant connexion :
    // sinon un identifiant de session connu d'un attaquant resterait valide
    // une fois la victime authentifiee.
    expect(cookieApres).toBeDefined();
    if (cookieAvant) {
      expect(cookieApres).not.toBe(cookieAvant);
    }
  });
});

describe("GET /api/auth/me", () => {
  it("renvoie 401 sans session", async () => {
    const agent = await anonymousAgent();
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("renvoie l'utilisateur connecte sans son mot de passe", async () => {
    const user = await createUser("JUNIOR");
    const agent = await loginAs(user);

    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.user?.id ?? res.body.id).toBe(user.id);
    expect(JSON.stringify(res.body)).not.toContain("$2");
  });
});

describe("POST /api/auth/logout", () => {
  it("invalide reellement la session", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);

    expect((await agent.get("/api/auth/me")).status).toBe(200);

    const deconnexion = await agent.post("/api/auth/logout").send({});
    expect([200, 204]).toContain(deconnexion.status);

    // Le meme agent, donc le meme cookie : il ne doit plus donner acces.
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("Limitation du nombre de tentatives", () => {
  it("le limiteur de login est configure", async () => {
    const user = await createUser("SENIOR");
    const agent = await anonymousAgent();

    const res = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: "MauvaisMotDePasse123!" });

    // En test le plafond est volontairement haut (isDev), donc on ne peut pas
    // provoquer un 429 sans des centaines de requetes. On verifie que les
    // en-tetes standard du limiteur sont bien poses : sans eux, aucun
    // limiteur n'est monte sur la route.
    expect(res.headers).toHaveProperty("ratelimit-limit");
  });
});
