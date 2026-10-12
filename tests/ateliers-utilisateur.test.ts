/**
 * PATCH /api/auth/me/categories : remplacement des ateliers d'un utilisateur.
 *
 * Avant : suppression puis recreation une par une hors transaction, sans
 * verifier les identifiants. Un identifiant inconnu provoquait une erreur
 * au milieu et laissait l'utilisateur avec une liste vide ou partielle.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs } from "./helpers";
import { prisma } from "../server/prisma";

async function atelier(name: string) {
  return prisma.category.create({ data: { name } });
}

function ateliersDe(userId: string) {
  return prisma.userCategory.findMany({ where: { userId }, select: { categoryId: true } });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PATCH /api/auth/me/categories", () => {
  it("remplace la liste par celle envoyee", async () => {
    const user = await createUser("SENIOR");
    const jardinage = await atelier("Jardinage");
    const cuisine = await atelier("Cuisine");
    await prisma.userCategory.create({ data: { userId: user.id, categoryId: jardinage.id } });

    const res = await (await loginAs(user)).patch("/api/auth/me/categories").send({ categoryIds: [cuisine.id] });

    expect(res.status).toBe(200);
    expect((await ateliersDe(user.id)).map((c) => c.categoryId)).toEqual([cuisine.id]);
  });

  it("refuse un atelier inconnu sans toucher a la liste existante", async () => {
    const user = await createUser("SENIOR");
    const jardinage = await atelier("Jardinage");
    await prisma.userCategory.create({ data: { userId: user.id, categoryId: jardinage.id } });

    const res = await (await loginAs(user))
      .patch("/api/auth/me/categories")
      .send({ categoryIds: [jardinage.id, "id-supprime"] });

    expect(res.status).toBe(400);
    expect((await ateliersDe(user.id)).map((c) => c.categoryId)).toEqual([jardinage.id]);
  });

  it("ignore les doublons", async () => {
    const user = await createUser("SENIOR");
    const jardinage = await atelier("Jardinage");

    const res = await (await loginAs(user))
      .patch("/api/auth/me/categories")
      .send({ categoryIds: [jardinage.id, jardinage.id] });

    expect(res.status).toBe(200);
    expect(await ateliersDe(user.id)).toHaveLength(1);
  });

  it("accepte une liste vide (aucun atelier)", async () => {
    const user = await createUser("SENIOR");
    const jardinage = await atelier("Jardinage");
    await prisma.userCategory.create({ data: { userId: user.id, categoryId: jardinage.id } });

    const res = await (await loginAs(user)).patch("/api/auth/me/categories").send({ categoryIds: [] });

    expect(res.status).toBe(200);
    expect(await ateliersDe(user.id)).toHaveLength(0);
  });
});
