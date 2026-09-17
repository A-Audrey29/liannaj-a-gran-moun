/**
 * Utilitaires partages par les tests d'integration.
 *
 * L'app est montee en memoire (aucun port ouvert) et les sessions sont
 * conservees par un agent supertest, ce qui reproduit fidelement le parcours
 * d'un vrai navigateur : cookie de session, passport, permissions.
 */
import { createServer } from "http";
import type { Express } from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../server/app";
import { prisma } from "../server/prisma";

let appPromise: Promise<Express> | null = null;

/** App Express partagee par toute la suite (sa construction coute ~1 s). */
export async function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = createApp(createServer());
  }
  return appPromise;
}

/**
 * Vide les tables metier entre deux tests.
 *
 * L'ordre suit les dependances de cles etrangeres, du plus dependant vers le
 * moins. `session` est incluse : sans cela, les sessions d'un test precedent
 * survivraient et fausseraient les tests d'authentification.
 */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Report", "Favorite", "UserCategory", "AdminRecommendation",
      "Message", "Conversation", "CreditLedger", "Intervention", "Availability",
      "Relation", "Notification", "PaymentRecord", "PushSubscription",
      "TeacherComment", "TeacherStudent", "Category", "User",
      "session"
    RESTART IDENTITY CASCADE
  `);
}

export type RoleName = "ADMIN" | "SENIOR" | "JUNIOR" | "REFERENT_SENIOR" | "TEACHER";

let compteurEmail = 0;

/**
 * Cree un utilisateur actif. Le mot de passe est hache une seule fois et
 * reutilise : bcrypt coute ~100 ms par appel, ce qui domine sinon la duree
 * de la suite.
 */
let hachePartage: string | null = null;
export const MOT_DE_PASSE_TEST = "MotDePasseDeTest123!";

export async function createUser(
  role: RoleName,
  overrides: Record<string, any> = {}
) {
  if (!hachePartage) {
    hachePartage = await bcrypt.hash(MOT_DE_PASSE_TEST, 10);
  }
  compteurEmail++;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}-${compteurEmail}@test.local`,
      password: hachePartage,
      firstName: overrides.firstName ?? `Prenom${compteurEmail}`,
      lastName: overrides.lastName ?? `Nom${compteurEmail}`,
      role,
      status: overrides.status ?? "ACTIVE",
      ...overrides,
    },
  });
}

/**
 * Agent supertest authentifie : il conserve le cookie de session entre les
 * appels, comme le ferait un navigateur.
 */
export async function loginAs(user: { email: string }) {
  const app = await getApp();
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/login")
    .send({ email: user.email, password: MOT_DE_PASSE_TEST });

  if (res.status !== 200) {
    throw new Error(
      `Echec de connexion pour ${user.email} : ${res.status} ${JSON.stringify(res.body)}`
    );
  }
  return agent;
}

/** Agent non authentifie, pour verifier les refus d'acces. */
export async function anonymousAgent() {
  return request.agent(await getApp());
}

/** Relation active entre un senior et un jeune. */
export async function createRelation(
  seniorId: string,
  juniorId: string,
  status: "PENDING" | "PENDING_FIRST_MEETING" | "ACTIVE" | "PAUSED" | "CLOSED" = "ACTIVE"
) {
  return prisma.relation.create({
    data: { seniorId, juniorId, status },
  });
}

/**
 * Credite un senior pour les tests qui creent une intervention sur une
 * relation ACTIVE : sans credit, la creation est refusee (402) avant meme
 * d'atteindre la logique testee (double-booking, permissions, etc).
 */
export async function crediterSenior(seniorId: string, credits = 10) {
  return prisma.creditLedger.create({
    data: {
      seniorId,
      type: "PURCHASE",
      amount: credits,
      reason: "Credit de test",
    },
  });
}

/**
 * Rencontre terminee portant les deux feedbacks, pour tester les regles de
 * visibilite croisee.
 */
export async function createInterventionWithFeedback(
  relationId: string,
  overrides: Record<string, any> = {}
) {
  return prisma.intervention.create({
    data: {
      relationId,
      scheduledDate: overrides.scheduledDate ?? new Date("2026-06-15T14:00:00Z"),
      durationMinutes: overrides.durationMinutes ?? 90,
      status: overrides.status ?? "COMPLETED",
      tasks: overrides.tasks ?? ["Jardinage"],
      seniorRating: overrides.seniorRating ?? 5,
      seniorComment: overrides.seniorComment ?? "COMMENTAIRE_DU_SENIOR",
      juniorRating: overrides.juniorRating ?? 4,
      juniorComment: overrides.juniorComment ?? "COMMENTAIRE_DU_JEUNE",
      ...overrides,
    },
  });
}
