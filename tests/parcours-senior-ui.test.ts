/**
 * Parcours senior : navigation, achat, profil (retours d'Audrey du 2026-10-20).
 * Controles statiques + logique pure : pas de navigateur.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { spaceMenuLinks, homeTabsFor, PURCHASES_PATH } from "../client/src/lib/space-tabs";

const read = (p: string) => fs.readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

describe("menu burger sur les pages sans onglets", () => {
  it("le senior retrouve tous ses onglets, 'Mes achats' mene a la page d'achats", () => {
    const links = spaceMenuLinks("SENIOR");
    expect(links.map((l) => l.id)).toEqual(homeTabsFor("SENIOR").map((t) => t.id));
    expect(links.find((l) => l.id === "ateliers")?.href).toBe(PURCHASES_PATH);
    expect(links.find((l) => l.id === "dashboard")?.href).toBe("/mon-espace");
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
    expect(page).toContain("useCheckout");
    expect(page).toContain("Acheter en confiance");
  });
});

describe("espace senior : divers", () => {
  it("'Proposer une rencontre' n'apparait pas sur 'Mes informations'", () => {
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
    expect(c).toMatch(/AlertDialogAction[\s\S]*mutation\.mutate\(\)/);
  });
});
