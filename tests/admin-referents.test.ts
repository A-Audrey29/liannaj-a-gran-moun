/**
 * Création d'un aidant par l'admin (blocker n°3, audit du 2026-10-19).
 *
 * Le formulaire ne propose que des seniors actifs, mais la route acceptait
 * n'importe quel senior : un appel direct liait un aidant à un senior encore
 * en attente de validation. Et la photo par défaut pointait sur ui-avatars.com,
 * qui recevait le nom de l'aidant à chaque affichage.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs } from "./helpers";
import { prisma } from "../server/prisma";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function aidant(linkedSeniorId: string) {
  return {
    email: "aidant@test.local",
    password: "motdepasse",
    firstName: "Marc",
    lastName: "Aidant",
    linkedSeniorId,
  };
}

describe("POST /api/admin/referents", () => {
  it("refuse un senior en attente de validation", async () => {
    const senior = await createUser("SENIOR", { status: "PENDING_VALIDATION" });
    const admin = await loginAs(await createUser("ADMIN"));

    const res = await admin.post("/api/admin/referents").send(aidant(senior.id));

    expect(res.status).toBe(400);
    expect(await prisma.user.count({ where: { role: "REFERENT_SENIOR" } })).toBe(0);
  });

  it("crée l'aidant d'un senior actif, sans photo hébergée chez un tiers", async () => {
    const senior = await createUser("SENIOR");
    const admin = await loginAs(await createUser("ADMIN"));

    const res = await admin.post("/api/admin/referents").send(aidant(senior.id));

    expect(res.status).toBe(201);
    expect(res.body.profilePhoto).toBeNull();
  });
});

describe("POST /api/admin/teachers", () => {
  it("crée un professeur sans photo hébergée chez un tiers", async () => {
    const admin = await loginAs(await createUser("ADMIN"));

    const res = await admin.post("/api/admin/teachers").send({
      email: "prof@test.local",
      password: "motdepasse",
      firstName: "Sophie",
      lastName: "Prof",
    });

    expect(res.status).toBe(201);
    expect(res.body.profilePhoto).toBeNull();
  });
});
