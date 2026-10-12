/**
 * Visibilite croisee des feedbacks.
 *
 * Regle metier : un jeune et un senior ne voient QUE leur propre appreciation.
 * Aucun ne doit recevoir le jugement que l'autre a porte sur lui. Le
 * masquage est fait cote serveur (scopeFeedback / scopeInterventionFeedback)
 * et non a l'affichage : la donnee masquee ne doit pas partir sur le reseau.
 *
 * Ces tests verifient le contenu de la reponse HTTP, pas l'UI — c'est
 * exactement la ou une regression passerait inapercue.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  resetDatabase,
  createUser,
  loginAs,
  createRelation,
  createInterventionWithFeedback,
} from "./helpers";
import { prisma } from "../server/prisma";

const COMMENTAIRE_SENIOR = "COMMENTAIRE_DU_SENIOR";
const COMMENTAIRE_JEUNE = "COMMENTAIRE_DU_JEUNE";

/** Contexte partage : une relation senior/jeune avec une rencontre notee des deux cotes. */
async function contexteAvecFeedbacks() {
  const senior = await createUser("SENIOR");
  const junior = await createUser("JUNIOR");
  const relation = await createRelation(senior.id, junior.id);
  const intervention = await createInterventionWithFeedback(relation.id);
  return { senior, junior, relation, intervention };
}

/** Toutes les rencontres presentes dans une reponse /api/relations. */
function interventionsDe(body: any): any[] {
  if (Array.isArray(body)) return body.flatMap((r) => r.interventions ?? []);
  return body.interventions ?? [];
}

/** Recherche brute dans la charge utile : detecte toute fuite, meme via un champ oublie. */
function corpsBrut(body: any): string {
  return JSON.stringify(body);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/relations — masquage des feedbacks", () => {
  it("le senior voit son propre feedback mais pas celui du jeune", async () => {
    const { senior } = await contexteAvecFeedbacks();
    const agent = await loginAs(senior);

    const res = await agent.get("/api/relations");
    expect(res.status).toBe(200);

    const [intervention] = interventionsDe(res.body);
    expect(intervention.seniorRating).toBe(5);
    expect(intervention.seniorComment).toBe(COMMENTAIRE_SENIOR);
    expect(intervention.juniorRating).toBeNull();
    expect(intervention.juniorComment).toBeNull();
    expect(corpsBrut(res.body)).not.toContain(COMMENTAIRE_JEUNE);
  });

  it("le jeune voit son propre feedback mais pas celui du senior", async () => {
    const { junior } = await contexteAvecFeedbacks();
    const agent = await loginAs(junior);

    const res = await agent.get("/api/relations");
    expect(res.status).toBe(200);

    const [intervention] = interventionsDe(res.body);
    expect(intervention.juniorRating).toBe(4);
    expect(intervention.juniorComment).toBe(COMMENTAIRE_JEUNE);
    expect(intervention.seniorRating).toBeNull();
    expect(intervention.seniorComment).toBeNull();
    expect(corpsBrut(res.body)).not.toContain(COMMENTAIRE_SENIOR);
  });

  it("l'admin voit les deux feedbacks", async () => {
    await contexteAvecFeedbacks();
    const admin = await createUser("ADMIN");
    const agent = await loginAs(admin);

    // L'admin n'est partie a aucune relation : il passe par sa propre route.
    const res = await agent.get("/api/admin/interventions");
    expect(res.status).toBe(200);
    const corps = corpsBrut(res.body);
    expect(corps).toContain(COMMENTAIRE_SENIOR);
    expect(corps).toContain(COMMENTAIRE_JEUNE);
  });
});

describe("GET /api/relations/:id — masquage sur la fiche detaillee", () => {
  it("la fiche relation applique le meme masquage que la liste", async () => {
    const { senior, relation } = await contexteAvecFeedbacks();
    const agent = await loginAs(senior);

    const res = await agent.get(`/api/relations/${relation.id}`);
    expect(res.status).toBe(200);

    const [intervention] = interventionsDe(res.body);
    expect(intervention.seniorComment).toBe(COMMENTAIRE_SENIOR);
    expect(intervention.juniorComment).toBeNull();
    expect(corpsBrut(res.body)).not.toContain(COMMENTAIRE_JEUNE);
  });

  it("un tiers sans lien avec la relation recoit 403", async () => {
    const { relation } = await contexteAvecFeedbacks();
    const autreSenior = await createUser("SENIOR");
    const agent = await loginAs(autreSenior);

    const res = await agent.get(`/api/relations/${relation.id}`);
    expect(res.status).toBe(403);
  });

  it("le referent du senior voit le feedback du senior, pas celui du jeune", async () => {
    const { senior, relation } = await contexteAvecFeedbacks();
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const agent = await loginAs(referent);

    const res = await agent.get(`/api/relations/${relation.id}`);
    expect(res.status).toBe(200);

    const [intervention] = interventionsDe(res.body);
    expect(intervention.seniorComment).toBe(COMMENTAIRE_SENIOR);
    expect(intervention.juniorComment).toBeNull();
    expect(corpsBrut(res.body)).not.toContain(COMMENTAIRE_JEUNE);
  });
});

describe("GET /api/meetings/history — masquage dans l'historique", () => {
  it("le jeune ne recoit pas le commentaire du senior", async () => {
    const { junior } = await contexteAvecFeedbacks();
    const agent = await loginAs(junior);

    const res = await agent.get("/api/meetings/history");
    expect(res.status).toBe(200);
    expect(corpsBrut(res.body)).not.toContain(COMMENTAIRE_SENIOR);
    expect(corpsBrut(res.body)).toContain(COMMENTAIRE_JEUNE);
  });

  it("le senior ne recoit pas le commentaire du jeune", async () => {
    const { senior } = await contexteAvecFeedbacks();
    const agent = await loginAs(senior);

    const res = await agent.get("/api/meetings/history");
    expect(res.status).toBe(200);
    expect(corpsBrut(res.body)).not.toContain(COMMENTAIRE_JEUNE);
    expect(corpsBrut(res.body)).toContain(COMMENTAIRE_SENIOR);
  });

  it("l'historique d'un jeune ne contient que ses propres rencontres", async () => {
    const { junior } = await contexteAvecFeedbacks();

    // Une seconde relation, sans lien avec ce jeune.
    const autreSenior = await createUser("SENIOR");
    const autreJunior = await createUser("JUNIOR");
    const autreRelation = await createRelation(autreSenior.id, autreJunior.id);
    await createInterventionWithFeedback(autreRelation.id, {
      seniorComment: "FEEDBACK_D_UNE_AUTRE_RELATION",
      juniorComment: "AUTRE_FEEDBACK_JEUNE",
    });

    const agent = await loginAs(junior);
    const res = await agent.get("/api/meetings/history");

    expect(res.status).toBe(200);
    const corps = corpsBrut(res.body);
    expect(corps).not.toContain("FEEDBACK_D_UNE_AUTRE_RELATION");
    expect(corps).not.toContain("AUTRE_FEEDBACK_JEUNE");
  });
});

describe("GET /api/referent/relations — espace referent", () => {
  it("le referent recoit le feedback du senior, jamais celui du jeune", async () => {
    const { senior } = await contexteAvecFeedbacks();
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const agent = await loginAs(referent);

    const res = await agent.get("/api/referent/relations");
    expect(res.status).toBe(200);

    const [intervention] = interventionsDe(res.body);
    expect(intervention.seniorComment).toBe(COMMENTAIRE_SENIOR);
    expect(intervention.juniorRating).toBeNull();
    expect(corpsBrut(res.body)).not.toContain(COMMENTAIRE_JEUNE);
  });
});

describe("GET /api/interventions/pending-feedback — avant d'avoir note", () => {
  it("le senior qui n'a pas encore note ne recoit pas la note du jeune", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id);
    await createInterventionWithFeedback(relation.id, {
      status: "COMPLETED_PENDING_FEEDBACK",
      seniorRating: null,
      seniorComment: null,
    });

    const res = await (await loginAs(senior)).get("/api/interventions/pending-feedback");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].juniorRating).toBeNull();
    expect(corpsBrut(res.body)).not.toContain(COMMENTAIRE_JEUNE);
  });
});

describe("POST /api/interventions/:id/feedback — reponse", () => {
  it("la reponse au jeune ne contient pas le feedback deja donne par le senior", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id);
    const intervention = await createInterventionWithFeedback(relation.id, {
      status: "COMPLETED_PENDING_FEEDBACK",
      juniorRating: null,
      juniorComment: null,
    });

    const res = await (await loginAs(junior))
      .post(`/api/interventions/${intervention.id}/feedback`)
      .send({ rating: 4, comment: "Merci" });

    expect(res.status).toBe(200);
    expect(res.body.juniorRating).toBe(4);
    expect(res.body.seniorRating).toBeNull();
    expect(corpsBrut(res.body)).not.toContain(COMMENTAIRE_SENIOR);
  });
});

describe("GET /api/meetings/history — filtres de dates en heure de Guadeloupe", () => {
  it("une rencontre du 10 a 21h (GP) appartient au 10, pas au 11", async () => {
    const { junior, relation } = await contexteAvecFeedbacks();
    await prisma.intervention.deleteMany();
    // 10 octobre 21:00 en Guadeloupe (UTC-4) = 11 octobre 01:00 UTC.
    await createInterventionWithFeedback(relation.id, { scheduledDate: new Date("2026-10-11T01:00:00Z") });
    const agent = await loginAs(junior);

    const le10 = await agent.get("/api/meetings/history?from=2026-10-10&to=2026-10-10");
    const le11 = await agent.get("/api/meetings/history?from=2026-10-11&to=2026-10-11");

    expect(le10.status).toBe(200);
    expect(le10.body.entries).toHaveLength(1);
    expect(le11.body.entries).toHaveLength(0);
  });
});
