/**
 * canBuyCredits (shared/credits.ts) decides who sees the buy buttons on
 * /forfaits, the "Mes achats" purchase card and the "buy" action after a
 * refused booking. It must be exactly creditOwnerId(user) !== null: a
 * referent without a linked senior has no balance, so cannot buy (#48 d).
 * Every role of the Prisma schema is checked, so a new role cannot silently
 * gain or lose the right to buy.
 */
import { describe, it, expect } from "vitest";
import { Role } from "../generated/prisma/enums";
import { canBuyCredits, creditOwnerId, insufficientCreditsNotice } from "../shared/credits";

const user = (role: string, linkedSeniorId: string | null = null) => ({ id: "u1", role, linkedSeniorId });

describe("canBuyCredits", () => {
  it("autorise le senior", () => {
    expect(canBuyCredits(user(Role.SENIOR))).toBe(true);
  });

  it("autorise le referent lie a un senior", () => {
    expect(canBuyCredits(user(Role.REFERENT_SENIOR, "senior-1"))).toBe(true);
  });

  it("refuse le referent sans senior lie", () => {
    expect(canBuyCredits(user(Role.REFERENT_SENIOR, null))).toBe(false);
    expect(canBuyCredits({ id: "u1", role: Role.REFERENT_SENIOR })).toBe(false);
  });

  it("refuse le jeune", () => {
    expect(canBuyCredits(user(Role.JUNIOR))).toBe(false);
  });

  it("refuse l'administrateur", () => {
    expect(canBuyCredits(user(Role.ADMIN))).toBe(false);
  });

  it("refuse l'enseignant", () => {
    expect(canBuyCredits(user(Role.TEACHER))).toBe(false);
  });

  it("couvre tous les roles du schema Prisma (avec senior lie)", () => {
    const allowed = Object.values(Role).filter((r) => canBuyCredits(user(r, "senior-1")));
    expect(allowed.sort()).toEqual(["REFERENT_SENIOR", "SENIOR"]);
    expect(Object.values(Role)).toHaveLength(5);
  });

  it("vaut toujours creditOwnerId(user) !== null (une seule regle)", () => {
    for (const role of Object.values(Role)) {
      for (const linked of [null, "senior-1"]) {
        const u = user(role, linked);
        expect(canBuyCredits(u)).toBe(creditOwnerId(u) !== null);
      }
    }
  });

  it("refuse un visiteur sans compte", () => {
    expect(canBuyCredits(undefined)).toBe(false);
    expect(canBuyCredits(null)).toBe(false);
  });
});

/**
 * insufficientCreditsNotice: wording shown when a booking is refused with
 * INSUFFICIENT_CREDITS (#48 e). The "buy" action follows canBuyCredits; a
 * junior is never offered to buy.
 */
describe("insufficientCreditsNotice", () => {
  it("senior : message + achat", () => {
    expect(insufficientCreditsNotice(user(Role.SENIOR))).toEqual({
      title: "Plus d'atelier disponible",
      message: "Vous n'avez plus d'atelier disponible.",
      canBuy: true,
    });
  });

  it("referent lie a un senior : message + achat", () => {
    const n = insufficientCreditsNotice(user(Role.REFERENT_SENIOR, "senior-1"));
    expect(n.message).toBe("Vous n'avez plus d'atelier disponible.");
    expect(n.canBuy).toBe(true);
  });

  it("referent sans senior lie : message sans achat", () => {
    const n = insufficientCreditsNotice(user(Role.REFERENT_SENIOR, null));
    expect(n.canBuy).toBe(false);
  });

  it("jeune : le senior n'a plus d'atelier, jamais d'achat", () => {
    expect(insufficientCreditsNotice(user(Role.JUNIOR))).toEqual({
      title: "Plus d'atelier disponible",
      message: "Le senior n'a plus d'atelier disponible.",
      canBuy: false,
    });
  });

  it("l'achat n'est propose qu'a qui peut acheter (tous roles)", () => {
    for (const role of Object.values(Role)) {
      for (const linked of [null, "senior-1"]) {
        const u = user(role, linked);
        expect(insufficientCreditsNotice(u).canBuy).toBe(canBuyCredits(u));
      }
    }
  });

  it("sans compte : pas d'achat", () => {
    expect(insufficientCreditsNotice(null).canBuy).toBe(false);
  });
});
