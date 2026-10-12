/**
 * Net Promoter Score: pure helpers shared by the server (stats route) and the
 * client (admin tab, CSV export). No score is stored besides the raw 0-10
 * answer, categories and the NPS are always derived.
 */

export type NpsCategory = "DETRACTOR" | "PASSIVE" | "PROMOTER";

export const NPS_MIN_SCORE = 0;
export const NPS_MAX_SCORE = 10;

/** One person is asked at most once per this many days. */
export const NPS_COOLDOWN_DAYS = 90;

/** Below this many answers the NPS swings wildly: the UI shows a warning. */
export const NPS_MIN_RELIABLE_SAMPLE = 30;

/** Standard NPS buckets: 0-6 detractor, 7-8 passive, 9-10 promoter. */
export function npsCategory(score: number): NpsCategory {
  if (score >= 9) return "PROMOTER";
  if (score >= 7) return "PASSIVE";
  return "DETRACTOR";
}

export interface NpsSummary {
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** % promoters - % detractors, rounded, from -100 to 100. null if no answer. */
  nps: number | null;
}

/** Who answered. Kept apart in the figures: two different populations. */
export type NpsSegment = "SENIOR" | "REFERENT_SENIOR";

export const NPS_SEGMENTS: NpsSegment[] = ["SENIOR", "REFERENT_SENIOR"];

/** One answer as sent to the admin tab (names are for admin follow-up only). */
export interface NpsResponseEntry {
  id: string;
  createdAt: string;
  segment: NpsSegment;
  score: number;
  category: NpsCategory;
  reason: string | null;
  firstName: string;
  lastName: string;
}

export interface NpsReport {
  summary: NpsSummary;
  bySegment: Record<NpsSegment, NpsSummary>;
  responses: NpsResponseEntry[];
}

export interface NpsEligibilityResponse {
  eligible: boolean;
}

export function buildNpsReport(responses: NpsResponseEntry[]): NpsReport {
  const scoresOf = (segment?: NpsSegment) =>
    responses.filter((r) => !segment || r.segment === segment).map((r) => r.score);
  return {
    summary: computeNps(scoresOf()),
    bySegment: {
      SENIOR: computeNps(scoresOf("SENIOR")),
      REFERENT_SENIOR: computeNps(scoresOf("REFERENT_SENIOR")),
    },
    responses,
  };
}

export function computeNps(scores: number[]): NpsSummary {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const score of scores) {
    const category = npsCategory(score);
    if (category === "PROMOTER") promoters++;
    else if (category === "PASSIVE") passives++;
    else detractors++;
  }
  const total = scores.length;
  const nps = total === 0 ? null : Math.round(((promoters - detractors) / total) * 100);
  return { total, promoters, passives, detractors, nps };
}
