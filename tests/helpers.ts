/**
 * Utilitaires partages par les tests d'integration.
 *
 * L'app ecoute sur un port local unique et les sessions sont conservees par
 * un agent supertest, ce qui reproduit fidelement le parcours d'un vrai
 * navigateur : cookie de session, passport, permissions.
 */
import { createServer, type Server } from "http";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../server/app";
import { prisma } from "../server/prisma";

let serverPromise: Promise<Server> | null = null;

/**
 * Serveur HTTP partage par tout le fichier de test (la construction de l'app
 * coute ~1 s), deja en ecoute sur 127.0.0.1.
 *
 * Ne pas passer l'app Express brute a supertest : il ouvrirait et fermerait
 * alors un serveur sur un port ephemere a chaque requete. Une connexion
 * keep-alive peut ensuite viser un port deja repris par un autre processus de
 * la machine, d'ou des 404/400 vides et des sessions perdues aleatoires.
 */
export async function getApp(): Promise<Server> {
  if (!serverPromise) {
    serverPromise = (async () => {
      const httpServer = createServer();
      const app = await createApp(httpServer);
      httpServer.on("request", app);
      await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
      return httpServer;
    })();
  }
  return serverPromise;
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
      "Message", "Conversation", "Intervention", "Availability",
      "Relation", "Notification", "PaymentRecord", "PushSubscription",
      "TeacherComment", "TeacherStudent", "Internship", "Category", "User",
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
