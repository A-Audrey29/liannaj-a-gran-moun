/**
 * Pure NPS logic (categories, score) and the input schema.
 *
 * Boundaries are the whole point: 6/7 and 8/9 decide who counts as a
 * detractor or a promoter, and 0 must be a valid score.
 */
import { describe, it, expect } from "vitest";
import { npsCategory, computeNps } from "../shared/nps";
import { npsSchema } from "../shared/schema";
import { csvSafeText } from "../client/src/lib/csv";

describe("npsCategory", () => {
  it("classifies 0-6 as detractor", () => {
    for (const score of [0, 1, 5, 6]) {
      expect(npsCategory(score)).toBe("DETRACTOR");
    }
  });

  it("classifies 7-8 as passive", () => {
    for (const score of [7, 8]) {
      expect(npsCategory(score)).toBe("PASSIVE");
    }
  });

  it("classifies 9-10 as promoter", () => {
    for (const score of [9, 10]) {
      expect(npsCategory(score)).toBe("PROMOTER");
    }
  });
});

describe("computeNps", () => {
  it("returns a null NPS when there is no answer", () => {
    expect(computeNps([])).toEqual({
      total: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      nps: null,
    });
  });

  it("gives +100 when everybody is a promoter", () => {
    expect(computeNps([9, 10, 10]).nps).toBe(100);
  });

  it("gives -100 when everybody is a detractor, 0 included", () => {
    expect(computeNps([0, 3, 6]).nps).toBe(-100);
  });

  it("ignores passives in the score but counts them in the total", () => {
    // 2 promoters, 1 passive, 1 detractor -> (2 - 1) / 4 = 25
    const summary = computeNps([10, 9, 8, 2]);
    expect(summary).toEqual({
      total: 4,
      promoters: 2,
      passives: 1,
      detractors: 1,
      nps: 25,
    });
  });

  it("rounds to the nearest integer", () => {
    // 1 promoter, 2 passives -> 1/3 = 33.33 -> 33
    expect(computeNps([10, 7, 8]).nps).toBe(33);
  });
});

describe("npsSchema", () => {
  it("accepts 0 and 10", () => {
    expect(npsSchema.safeParse({ score: 0 }).success).toBe(true);
    expect(npsSchema.safeParse({ score: 10 }).success).toBe(true);
  });

  it.each([-1, 11, 1.5, "7", null, undefined])("rejects score %s", (score) => {
    expect(npsSchema.safeParse({ score }).success).toBe(false);
  });

  it("rejects a reason longer than 1000 characters", () => {
    expect(npsSchema.safeParse({ score: 5, reason: "a".repeat(1001) }).success).toBe(false);
  });

  it("accepts an absent reason", () => {
    expect(npsSchema.safeParse({ score: 5 }).success).toBe(true);
  });
});

describe("csvSafeText", () => {
  it.each(['=HYPERLINK("http://evil","x")', "+33 6 00 00 00 00", "-1+1", "@SUM(A1)", "\tcmd", "\rcmd"])(
    "neutralises a formula prefix: %j",
    (value) => {
      expect(csvSafeText(value)).toBe(`'${value}`);
    },
  );

  it("leaves ordinary text, accents and empty values untouched", () => {
    for (const value of ["Très aimable", "10 sur 10 = parfait", "", "ok - merci"]) {
      expect(csvSafeText(value)).toBe(value);
    }
  });
});
