/**
 * shared/credit-offers.ts is the single source of the offers (Stripe
 * checkout, webhook, purchase card, /forfaits page, admin). These checks
 * protect the invariants the rest of the code relies on.
 */
import { describe, it, expect } from "vitest";
import { CREDIT_OFFERS, findCreditOffer } from "../shared/credit-offers";

describe("CREDIT_OFFERS", () => {
  it("propose exactement 3 forfaits nommes", () => {
    expect(CREDIT_OFFERS.map((o) => o.name)).toEqual(["Découverte", "Essentiel", "Sérénité"]);
  });

  it("a des id uniques", () => {
    const ids = CREDIT_OFFERS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("conserve pack-1 et pack-5 (relus par le webhook pour les paiements en cours)", () => {
    expect(findCreditOffer("pack-1")).toMatchObject({ name: "Découverte", credits: 1, priceEuros: 18 });
    expect(findCreditOffer("pack-5")).toMatchObject({ name: "Essentiel", credits: 5, priceEuros: 85 });
    expect(findCreditOffer("pack-10")).toMatchObject({ name: "Sérénité", credits: 10, priceEuros: 160 });
  });

  it("a des prix et des credits entiers strictement positifs", () => {
    for (const offer of CREDIT_OFFERS) {
      expect(Number.isInteger(offer.priceEuros)).toBe(true);
      expect(offer.priceEuros).toBeGreaterThan(0);
      expect(Number.isInteger(offer.credits)).toBe(true);
      expect(offer.credits).toBeGreaterThan(0);
      expect(offer.name.trim()).not.toBe("");
    }
  });

  it("a un prix par atelier strictement decroissant quand le forfait grossit", () => {
    const sorted = [...CREDIT_OFFERS].sort((a, b) => a.credits - b.credits);
    const perWorkshop = sorted.map((o) => o.priceEuros / o.credits);
    for (let i = 1; i < perWorkshop.length; i++) {
      expect(perWorkshop[i]).toBeLessThan(perWorkshop[i - 1]);
    }
  });
});
