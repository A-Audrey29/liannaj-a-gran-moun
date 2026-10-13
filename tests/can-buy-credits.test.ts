/**
 * canBuyCredits (shared/credits.ts) decides who sees the buy buttons on
 * /forfaits and who may open /mes-ateliers. Every role of the Prisma schema
 * is checked, so a new role cannot silently gain or lose the right to buy.
 */
import { describe, it, expect } from "vitest";
import { Role } from "../generated/prisma/enums";
import { canBuyCredits } from "../shared/credits";

describe("canBuyCredits", () => {
  it("autorise le senior", () => {
    expect(canBuyCredits(Role.SENIOR)).toBe(true);
  });

  it("autorise le referent d'un senior", () => {
    expect(canBuyCredits(Role.REFERENT_SENIOR)).toBe(true);
  });

  it("refuse le jeune", () => {
    expect(canBuyCredits(Role.JUNIOR)).toBe(false);
  });

  it("refuse l'administrateur", () => {
    expect(canBuyCredits(Role.ADMIN)).toBe(false);
  });

  it("refuse l'enseignant", () => {
    expect(canBuyCredits(Role.TEACHER)).toBe(false);
  });

  it("couvre tous les roles du schema Prisma", () => {
    const allowed = Object.values(Role).filter((r) => canBuyCredits(r));
    expect(allowed.sort()).toEqual(["REFERENT_SENIOR", "SENIOR"]);
    expect(Object.values(Role)).toHaveLength(5);
  });

  it("refuse un visiteur sans role", () => {
    expect(canBuyCredits(undefined)).toBe(false);
    expect(canBuyCredits(null)).toBe(false);
  });
});
