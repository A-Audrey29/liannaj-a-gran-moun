/**
 * Cloisonnement des roles.
 *
 * Chaque espace (admin, professeur, referent) doit etre inaccessible aux
 * quatre autres roles. C'est la protection la plus critique de la plateforme :
 * ces routes exposent des donnees de mineurs (coordonnees, ecole, referent
 * legal, appreciations).
 *
 * Table de verite plutot que tests un par un : ajouter une route protegee
 * revient a ajouter une ligne, ce qui evite qu'une nouvelle route echappe
 * silencieusement a la couverture.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  resetDatabase,
  createUser,
  loginAs,
  anonymousAgent,
  createRelation,
  type RoleName,
} from "./helpers";
import { prisma } from "../server/prisma";

type Methode = "get" | "post" | "patch" | "delete";

interface RouteProtegee {
  methode: Methode;
  chemin: string;
  /** Seul role autorise a franchir la garde. */
  roleAutorise: RoleName;
  /** Corps minimal, pour ne pas echouer sur la validation avant la garde. */
  corps?: Record<string, unknown>;
}

const ROUTES_ADMIN: RouteProtegee[] = [
  { methode: "get", chemin: "/api/admin/users", roleAutorise: "ADMIN" },
  { methode: "get", chemin: "/api/admin/relations", roleAutorise: "ADMIN" },
  { methode: "get", chemin: "/api/admin/interventions", roleAutorise: "ADMIN" },
  { methode: "get", chemin: "/api/admin/notifications", roleAutorise: "ADMIN" },
  { methode: "get", chemin: "/api/admin/payments", roleAutorise: "ADMIN" },
  { methode: "get", chemin: "/api/admin/reports", roleAutorise: "ADMIN" },
  { methode: "get", chemin: "/api/admin/relations/pending-meeting", roleAutorise: "ADMIN" },
  { methode: "get", chemin: "/api/admin/messages/conversations", roleAutorise: "ADMIN" },
  { methode: "get", chemin: "/api/admin/nps", roleAutorise: "ADMIN" },
  {
    methode: "post",
    chemin: "/api/admin/recommendations",
    roleAutorise: "ADMIN",
    corps: { seniorId: "x", juniorId: "y" },
  },
  {
    methode: "post",
    chemin: "/api/admin/create-admin",
    roleAutorise: "ADMIN",
    corps: { email: "x@test.local", password: "Motdepasse123!", firstName: "A", lastName: "B" },
  },
];

const ROUTES_PROFESSEUR: RouteProtegee[] = [
  { methode: "get", chemin: "/api/teacher/students", roleAutorise: "TEACHER" },
];

const ROUTES_REFERENT: RouteProtegee[] = [
  { methode: "get", chemin: "/api/referent/senior", roleAutorise: "REFERENT_SENIOR" },
  { methode: "get", chemin: "/api/referent/relations", roleAutorise: "REFERENT_SENIOR" },
];

const TOUS_LES_ROLES: RoleName[] = ["ADMIN", "SENIOR", "JUNIOR", "REFERENT_SENIOR", "TEACHER"];

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Cloisonnement des espaces par role", () => {
  const groupes = [
    { nom: "espace admin", routes: ROUTES_ADMIN },
    { nom: "espace professeur", routes: ROUTES_PROFESSEUR },
    { nom: "espace referent senior", routes: ROUTES_REFERENT },
  ];

  for (const groupe of groupes) {
    describe(groupe.nom, () => {
      for (const route of groupe.routes) {
        const rolesInterdits = TOUS_LES_ROLES.filter((r) => r !== route.roleAutorise);

        for (const role of rolesInterdits) {
          it(`${role} ne peut pas ${route.methode.toUpperCase()} ${route.chemin}`, async () => {
            const utilisateur = await createUser(role);
            const agent = await loginAs(utilisateur);

            const res = await agent[route.methode](route.chemin).send(route.corps ?? {});

            expect(res.status).toBe(403);
          });
        }

        it(`anonyme ne peut pas ${route.methode.toUpperCase()} ${route.chemin}`, async () => {
          const agent = await anonymousAgent();
          const res = await agent[route.methode](route.chemin).send(route.corps ?? {});
          expect(res.status).toBe(401);
        });
      }
    });
  }
});

describe("Acces legitimes", () => {
  it("l'admin accede a la liste des utilisateurs", async () => {
    const admin = await createUser("ADMIN");
    const agent = await loginAs(admin);
    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(200);
  });

  it("le professeur accede a ses eleves", async () => {
    const prof = await createUser("TEACHER");
    const agent = await loginAs(prof);
    const res = await agent.get("/api/teacher/students");
    expect(res.status).toBe(200);
  });

  it("le referent lie a un senior accede a ses relations", async () => {
    const senior = await createUser("SENIOR");
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const agent = await loginAs(referent);
    const res = await agent.get("/api/referent/relations");
    expect(res.status).toBe(200);
  });
});

describe("Isolation horizontale — un utilisateur ne voit pas les donnees d'un pair", () => {
  it("un senior ne voit pas les relations d'un autre senior", async () => {
    const seniorA = await createUser("SENIOR");
    const seniorB = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    await createRelation(seniorB.id, junior.id);

    const agent = await loginAs(seniorA);
    const res = await agent.get("/api/relations");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("un jeune ne peut pas consulter la fiche relation d'un autre jeune", async () => {
    const senior = await createUser("SENIOR");
    const juniorA = await createUser("JUNIOR");
    const juniorB = await createUser("JUNIOR");
    const relationDeB = await createRelation(senior.id, juniorB.id);

    const agent = await loginAs(juniorA);
    const res = await agent.get(`/api/relations/${relationDeB.id}`);

    expect(res.status).toBe(403);
  });

  it("un referent ne voit pas les relations d'un senior qui n'est pas le sien", async () => {
    const seniorLie = await createUser("SENIOR");
    const seniorEtranger = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relationEtrangere = await createRelation(seniorEtranger.id, junior.id);

    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: seniorLie.id });
    const agent = await loginAs(referent);

    const res = await agent.get(`/api/relations/${relationEtrangere.id}`);
    expect(res.status).toBe(403);
  });
});
