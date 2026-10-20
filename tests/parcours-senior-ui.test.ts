/**
 * Parcours senior : navigation, achat, profil (retours d'Audrey du 2026-10-20).
 * Controles statiques + logique pure : pas de navigateur.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { insertInterventionSchema, referentInterventionSchema } from "../shared/schema";
import { DEFAULT_WORKSHOP_MINUTES, FREE_FIRST_MEETING_MAX_MINUTES, defaultDurationMinutes } from "../shared/credits";
import { spaceMenuLinks, homeTabsFor, PURCHASES_PATH } from "../client/src/lib/space-tabs";

const read = (p: string) => fs.readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

describe("menu burger sur les pages sans onglets", () => {
  it("le senior retrouve tous ses onglets, 'Mes achats' mene a la page d'achats", () => {
    const links = spaceMenuLinks("SENIOR");
    expect(links.map((l) => l.id)).toEqual(homeTabsFor("SENIOR").map((t) => t.id));
    expect(links.find((l) => l.id === "ateliers")?.href).toBe(PURCHASES_PATH);
    // Explicit tab: without it Home reopens the last tab used (sessionStorage).
    expect(links.find((l) => l.id === "dashboard")?.href).toBe("/mon-espace?tab=dashboard");
    expect(links.find((l) => l.id === "messages")?.href).toBe("/mon-espace?tab=messages");
  });

  it("le jeune n'a pas 'Mes achats' ; l'aidant pointe vers son propre espace", () => {
    expect(spaceMenuLinks("JUNIOR").some((l) => l.id === "ateliers")).toBe(false);
    const aidant = spaceMenuLinks("REFERENT_SENIOR");
    expect(aidant.find((l) => l.id === "contact")?.href).toBe("/espace-referent?tab=contact");
    expect(aidant.find((l) => l.id === "ateliers")?.href).toBe(PURCHASES_PATH);
  });

  it("admin et professeur n'ont pas de liens d'espace (pas de sous-pages)", () => {
    expect(spaceMenuLinks("ADMIN")).toEqual([]);
    expect(spaceMenuLinks("TEACHER")).toEqual([]);
    expect(spaceMenuLinks(undefined)).toEqual([]);
  });

  it("le layout affiche ces liens quand la page n'enregistre pas d'onglets", () => {
    const layout = read("client/src/components/app-layout.tsx");
    expect(layout).toMatch(/!pageTabs && isAuthenticated \? spaceMenuLinks/);
    expect(layout).toContain("menu-space-links");
  });
});

describe("achat d'ateliers", () => {
  it("le tableau de bord et 'Mes achats' n'affichent qu'un bouton vers la page d'achat", () => {
    const card = read("client/src/components/credit-offers-card.tsx");
    expect(card).toContain('export const BUY_ATELIERS_PATH = "/forfaits"');
    expect(card).not.toContain("OffersGrid");
    const achats = read("client/src/pages/mes-ateliers.tsx");
    expect(achats).toContain("<BuyAteliersButton");
    expect(achats).not.toContain("OffersGrid");
  });

  it("la page d'achat explique les 3 etapes et propose le paiement", () => {
    const page = read("client/src/pages/forfaits.tsx");
    for (const n of [1, 2, 3]) expect(page).toContain(`<Step n={${n}}`);
    expect(page).toMatch(/const checkout = useCheckout\(\)/);
    expect(page).toMatch(/checkout\.mutate\(offer\.id\)/);
    expect(page).toContain("Acheter en confiance");
    // Ecrite comme si le paiement etait branche : pas de repli "ecrivez a l'equipe" pour acheter.
    expect(page).not.toMatch(/pas encore ouvert|Demander à l'équipe|useOnlinePayment/);
    expect(page).toContain("Besoin d'aide ?");
  });
});

describe("espace senior : divers", () => {
  it("'Demander un atelier' n'apparait pas sur 'Mes informations'", () => {
    expect(read("client/src/pages/home.tsx")).toMatch(/activeTab !== "profil" && !relLoading && proposableRelations/);
  });

  it("'Trouver un profil' s'ouvre sur le carrousel", () => {
    expect(read("client/src/pages/home.tsx")).toContain('useState<"list" | "carousel">("carousel")');
  });

  it("la demande de suppression est proposee aux senior, jeune, aidant et professeur", () => {
    for (const f of ["home", "referent", "teacher"]) {
      expect(read(`client/src/pages/${f}.tsx`), f).toContain("<AccountDeletionRequest");
    }
    const c = read("client/src/components/account-deletion-request.tsx");
    expect(c).toContain('{ confirmed: true }');
    expect(c).toContain("seront perdus");
    // La requete ne part qu'apres le clic de confirmation dans la fenetre.
    expect(c).toMatch(/onClick=\{\(e\) => \{[^}]*e\.preventDefault\(\);[^}]*mutation\.mutate\(\);/);
    // L'etat "envoyee" vient du serveur : il survit au changement d'onglet.
    expect(c).toContain("/api/account/deletion-request");
    expect(c).not.toMatch(/useState\(false\)[\s\S]{0,40}setSent/);
  });
});

describe("atelier : durée par défaut et vocabulaire", () => {
  it("un atelier sans durée choisie dure 60 minutes (serveur, formulaire, base)", () => {
    expect(DEFAULT_WORKSHOP_MINUTES).toBe(60);
    const base = { relationId: "r1", scheduledDate: new Date(Date.now() + 86_400_000).toISOString() };
    expect(insertInterventionSchema.parse(base).durationMinutes).toBe(60);
    expect(referentInterventionSchema.parse(base).durationMinutes).toBe(60);
    expect(read("prisma/schema.prisma")).toMatch(/durationMinutes Int\s+@default\(60\)/);
    expect(read("client/src/pages/relation-detail.tsx")).not.toMatch(/: 120\b/);
  });

  it("le formulaire démarre à 60 min, 30 min pour la 1ère rencontre, sans dépasser le créneau", () => {
    expect(defaultDurationMinutes(false)).toBe(60);
    expect(defaultDurationMinutes(true)).toBe(FREE_FIRST_MEETING_MAX_MINUTES);
    expect(defaultDurationMinutes(false, 240)).toBe(60);
    expect(defaultDurationMinutes(false, 45)).toBe(45);
    expect(defaultDurationMinutes(true, 45)).toBe(30);
    expect(defaultDurationMinutes(false, 30)).toBe(30);
    expect(defaultDurationMinutes(false, 9999)).toBe(60);
  });

  it("la migration de la durée par défaut colle au schéma Prisma et se défait", () => {
    const dir = "prisma/migrations/20261020120000_intervention_default_duration_60";
    expect(read(`${dir}/migration.sql`)).toMatch(/ALTER COLUMN "durationMinutes" SET DEFAULT 60;/);
    expect(read(`${dir}/down.sql`)).toMatch(/ALTER COLUMN "durationMinutes" SET DEFAULT 120;/);
    expect(read("prisma/schema.prisma")).toMatch(/durationMinutes Int\s+@default\(60\)/);
  });

  it("la page d'achat ne montre les règles de crédits qu'à ceux qui peuvent acheter", () => {
    const page = read("client/src/pages/forfaits.tsx").replace(/\s+/g, " ");
    expect(page).toMatch(/\{canBuy && \( <> <h2[^>]*>Comment vos crédits sont utilisés/);
    expect(page).toMatch(/\{canBuy && \( <> <p className="mb-2">Pour faire un atelier/);
  });

  it("la première rencontre offerte garde ses 30 minutes", () => {
    expect(read("shared/credits.ts")).toContain("FREE_FIRST_MEETING_MAX_MINUTES = 30");
  });

  it("le senior et l'aidant « demandent un atelier » (plus de « proposer une rencontre »)", () => {
    for (const f of ["home", "referent"]) {
      const src = read(`client/src/pages/${f}.tsx`);
      expect(src, f).toContain("Demander un atelier");
      expect(src, f).not.toMatch(/Proposer une rencontre/);
    }
    expect(read("client/src/pages/relation-detail.tsx")).toContain('"Demander un atelier"');
  });
});
