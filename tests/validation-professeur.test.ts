/**
 * Validation de l'inscription d'un jeune par son professeur (2026-11-10).
 *
 *  - le professeur voit tout le profil avant de décider (bio, ateliers, photo) ;
 *  - valider rattache l'élève au professeur : compte prof existant, ou créé
 *    dans la même étape avec l'adresse qui a reçu le lien (jamais celle de la
 *    requête) ; tout ou rien ;
 *  - « ce n'est pas mon élève » : compte suspendu (jamais supprimé), admins
 *    prévenus ;
 *  - FEVES est prévenue en arrière-plan (nouveau prof, élève sans prof).
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import crypto from "node:crypto";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import { resetDatabase, createUser, anonymousAgent, loginAs, MOT_DE_PASSE_TEST } from "./helpers";
import { prisma } from "../server/prisma";
import { sendEmail } from "../server/lib/email";

const PROF_EMAIL = "prof.martin@ecole.test";

async function jeuneEnAttente(overrides: Record<string, any> = {}) {
  const token = crypto.randomUUID();
  const junior = await createUser("JUNIOR", {
    status: "PENDING_VALIDATION",
    validationToken: token,
    validationExpiry: new Date(Date.now() + 60 * 60 * 1000),
    referentEmail: PROF_EMAIL,
    validatorEmail: PROF_EMAIL,
    firstName: "Kenzo",
    lastName: "Bélair",
    bio: "J'aime le jardinage et aider mes voisins.",
    schoolName: "Lycée Baimbridge",
    city: "Les Abymes",
    ...overrides,
  });
  const jardinage = await prisma.category.create({ data: { name: "Jardinage" } });
  await prisma.userCategory.create({ data: { userId: junior.id, categoryId: jardinage.id } });
  return { junior, token };
}

const prof = { firstName: "Paul", lastName: "Martin", password: MOT_DE_PASSE_TEST };

function liens(teacherId: string) {
  return prisma.teacherStudent.findMany({ where: { teacherId } });
}

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(sendEmail).mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

describe("GET /api/validate/info pour un jeune", () => {
  it("montre tout le profil : nom, bio, ateliers, établissement", async () => {
    const { token } = await jeuneEnAttente();
    const res = await (await anonymousAgent()).get(`/api/validate/info?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.student).toMatchObject({
      firstName: "Kenzo",
      lastName: "Bélair",
      bio: "J'aime le jardinage et aider mes voisins.",
      schoolName: "Lycée Baimbridge",
      city: "Les Abymes",
      ateliers: ["Jardinage"],
    });
    // Never the junior's e-mail, phone or address.
    expect(JSON.stringify(res.body)).not.toContain("@test.local");
    expect(res.body.teacher).toEqual({ email: PROF_EMAIL, account: "none" });
  });

  it("reconnaît un compte professeur existant", async () => {
    const { token } = await jeuneEnAttente();
    await createUser("TEACHER", { email: PROF_EMAIL });
    const res = await (await anonymousAgent()).get(`/api/validate/info?token=${token}`);
    expect(res.body.teacher.account).toBe("teacher");
  });

  it("une adresse déjà prise par un autre rôle : 'other'", async () => {
    const { token } = await jeuneEnAttente();
    await createUser("SENIOR", { email: PROF_EMAIL });
    const res = await (await anonymousAgent()).get(`/api/validate/info?token=${token}`);
    expect(res.body.teacher.account).toBe("other");
  });

  it("photo : servie avec le jeton, pas sans", async () => {
    const { junior, token } = await jeuneEnAttente({ profilePhoto: "/uploads/11111111-1111-1111-1111-111111111111.webp" });
    await prisma.profilePhoto.create({
      data: { userId: junior.id, filename: "11111111-1111-1111-1111-111111111111.webp", mimeType: "image/webp", data: Buffer.from("webp"), byteSize: 4 },
    });
    const agent = await anonymousAgent();
    expect((await agent.get(`/api/validate/photo?token=${token}`)).status).toBe(200);
    expect((await agent.get(`/api/validate/photo?token=${crypto.randomUUID()}`)).status).toBe(404);
  });
});

describe("POST /api/validate : l'élève est attribué au professeur", () => {
  it("compte professeur existant : l'élève est rattaché", async () => {
    const { junior, token } = await jeuneEnAttente();
    const teacher = await createUser("TEACHER", { email: PROF_EMAIL });
    const res = await (await anonymousAgent()).post("/api/validate").send({ token });
    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: junior.id } })).status).toBe("ACTIVE");
    expect(await liens(teacher.id)).toHaveLength(1);
  });

  it("création de l'espace professeur avec l'adresse du lien, élève rattaché, admins prévenus", async () => {
    const admin = await createUser("ADMIN");
    const { junior, token } = await jeuneEnAttente();
    const res = await (await anonymousAgent())
      .post("/api/validate")
      .send({ token, teacher: prof, email: "pirate@evil.test" });
    expect(res.status).toBe(200);
    expect(res.body.teacherCreated).toBe(true);

    const teacher = await prisma.user.findUniqueOrThrow({ where: { email: PROF_EMAIL } });
    expect(teacher.role).toBe("TEACHER");
    expect(teacher.status).toBe("ACTIVE");
    expect(await prisma.user.findUnique({ where: { email: "pirate@evil.test" } })).toBeNull();
    expect((await liens(teacher.id)).map((l) => l.studentId)).toEqual([junior.id]);

    const notifs = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(notifs.map((n) => n.title)).toEqual(["Nouveau professeur inscrit"]);

    // The teacher can log in and read the bio in their space.
    const agent = await loginAs(teacher);
    const fiche = await agent.get(`/api/teacher/students/${junior.id}`);
    expect(fiche.status).toBe(200);
  });

  it("refuse de créer un espace professeur si l'adresse a déjà un compte", async () => {
    const { junior, token } = await jeuneEnAttente();
    await createUser("SENIOR", { email: PROF_EMAIL });
    const res = await (await anonymousAgent()).post("/api/validate").send({ token, teacher: prof });
    expect(res.status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: junior.id } })).status).toBe("PENDING_VALIDATION");
  });

  it("refuse un espace professeur sur l'inscription d'un senior", async () => {
    const { token } = await jeuneEnAttente({ role: "SENIOR" });
    const res = await (await anonymousAgent()).post("/api/validate").send({ token, teacher: prof });
    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: PROF_EMAIL } })).toBeNull();
  });

  it("validation sans compte professeur : élève actif, FEVES prévenue pour le rattacher", async () => {
    const admin = await createUser("ADMIN");
    const { junior, token } = await jeuneEnAttente();
    const res = await (await anonymousAgent()).post("/api/validate").send({ token });
    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: junior.id } })).status).toBe("ACTIVE");
    const notifs = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(notifs.map((n) => n.title)).toEqual(["Élève validé sans professeur rattaché"]);
  });

  it("double clic avec création : un seul compte professeur", async () => {
    const { token } = await jeuneEnAttente();
    const agent = await anonymousAgent();
    await Promise.all([
      agent.post("/api/validate").send({ token, teacher: prof }),
      agent.post("/api/validate").send({ token, teacher: prof }),
    ]);
    expect(await prisma.user.count({ where: { email: PROF_EMAIL } })).toBe(1);
  });
});

describe("POST /api/validate/refuse : ce n'est pas mon élève", () => {
  it("suspend le compte, consomme le lien, prévient le jeune et les admins", async () => {
    const admin = await createUser("ADMIN");
    const { junior, token } = await jeuneEnAttente();
    const res = await (await anonymousAgent()).post("/api/validate/refuse").send({ token });
    expect(res.status).toBe(200);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: junior.id } });
    expect(apres.status).toBe("SUSPENDED");
    expect(apres.validationToken).toBeNull();
    expect(vi.mocked(sendEmail).mock.calls.map((c) => c[0].to)).toEqual([junior.email]);
    const notifs = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(notifs.map((n) => n.title)).toEqual(["Inscription refusée"]);
  });

  it("le lien ne sert plus ensuite : ni validation, ni second refus", async () => {
    const { junior, token } = await jeuneEnAttente();
    const agent = await anonymousAgent();
    await agent.post("/api/validate/refuse").send({ token });
    expect((await agent.post("/api/validate").send({ token })).status).toBe(404);
    expect((await agent.post("/api/validate/refuse").send({ token })).status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: junior.id } })).status).toBe("SUSPENDED");
  });

  it("lien expiré : 410, rien ne change", async () => {
    const { junior, token } = await jeuneEnAttente({ validationExpiry: new Date(Date.now() - 1000) });
    const res = await (await anonymousAgent()).post("/api/validate/refuse").send({ token });
    expect(res.status).toBe(410);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: junior.id } })).status).toBe("PENDING_VALIDATION");
  });
});
