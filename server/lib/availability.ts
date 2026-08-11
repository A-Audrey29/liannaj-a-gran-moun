import { storage } from "../storage";
import { addDaysISO, partsFromISO, gpDateTimeToUtc } from "./dates";
import type { CreateRecurringAvailabilitiesInput, CreateDateExceptionInput } from "../../shared/schema";

/** Deux intervalles [aStart,aEnd) et [bStart,bEnd) se chevauchent-ils ? */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function confirmedIntervals(interventions: { scheduledDate: Date; durationMinutes: number }[]) {
  return interventions.map((i) => ({
    start: i.scheduledDate,
    end: new Date(i.scheduledDate.getTime() + i.durationMinutes * 60_000),
  }));
}

/**
 * Remplace les disponibilités AVAILABLE du Junior par le planning récurrent fourni.
 * Purge d'abord tout ce qui n'est pas protégé par une intervention CONFIRMED,
 * la fenêtre [from, to] devient la source de vérité pour les jours cochés.
 */
export async function createRecurringAvailabilities(
  userId: string,
  input: CreateRecurringAvailabilitiesInput
): Promise<{ created: number; deleted: number }> {
  const [existing, confirmed] = await Promise.all([
    storage.getAvailabilitiesByUser(userId),
    storage.getConfirmedInterventionsForUser(userId),
  ]);
  const protectedIntervals = confirmedIntervals(confirmed);

  const toDelete = existing.filter(
    (a) =>
      a.kind === "AVAILABLE" &&
      !protectedIntervals.some((p) => overlaps(a.startAt, a.endAt, p.start, p.end))
  );

  const toCreate: { userId: string; startAt: Date; endAt: Date; kind: "AVAILABLE" }[] = [];
  let dayISO = input.from;
  while (dayISO <= input.to) {
    const { dow } = partsFromISO(dayISO);
    for (const slot of input.slots) {
      if (slot.dayOfWeek !== dow) continue;
      const [sh, sm] = slot.startTime.split(":").map(Number);
      const [eh, em] = slot.endTime.split(":").map(Number);
      toCreate.push({
        userId,
        startAt: gpDateTimeToUtc(dayISO, sh, sm),
        endAt: gpDateTimeToUtc(dayISO, eh, em),
        kind: "AVAILABLE",
      });
    }
    dayISO = addDaysISO(dayISO, 1);
  }

  return storage.deleteAndCreateAvailabilities(toDelete.map((a) => a.id), toCreate);
}

/**
 * Exception ponctuelle sur une journée (ou plage horaire précise).
 * UNAVAILABLE : découpe les créneaux AVAILABLE existants non protégés qui
 * chevauchent la plage — les fragments avant/après l'exception sont réinsérés.
 */
export async function createDateException(
  userId: string,
  input: CreateDateExceptionInput
): Promise<{ created: number; deleted: number }> {
  const [startH, startM] = input.startTime ? input.startTime.split(":").map(Number) : [0, 0];
  const rangeStart = gpDateTimeToUtc(input.date, startH, startM);
  const rangeEnd = input.endTime
    ? gpDateTimeToUtc(input.date, ...(input.endTime.split(":").map(Number) as [number, number]))
    : gpDateTimeToUtc(addDaysISO(input.date, 1), 0, 0);

  let toDeleteIds: string[] = [];
  const toReinsert: { startAt: Date; endAt: Date }[] = [];

  if (input.kind === "UNAVAILABLE") {
    const [existing, confirmed] = await Promise.all([
      storage.getAvailabilitiesInRange(userId, rangeStart, rangeEnd),
      storage.getConfirmedInterventionsForUser(userId, rangeStart, rangeEnd),
    ]);
    const protectedIntervals = confirmedIntervals(confirmed);

    const toDelete = existing.filter(
      (a) =>
        a.kind === "AVAILABLE" &&
        overlaps(a.startAt, a.endAt, rangeStart, rangeEnd) &&
        !protectedIntervals.some((p) => overlaps(a.startAt, a.endAt, p.start, p.end))
    );
    toDeleteIds = toDelete.map((a) => a.id);

    if (toDelete.length > 0 && input.startTime && input.endTime) {
      for (const a of toDelete) {
        if (a.startAt < rangeStart) toReinsert.push({ startAt: a.startAt, endAt: rangeStart });
        if (a.endAt > rangeEnd) toReinsert.push({ startAt: rangeEnd, endAt: a.endAt });
      }
    }
  }

  const toCreate = [
    { userId, startAt: rangeStart, endAt: rangeEnd, kind: input.kind },
    ...toReinsert.map((r) => ({ userId, startAt: r.startAt, endAt: r.endAt, kind: "AVAILABLE" as const })),
  ];

  const { deleted } = await storage.deleteAndCreateAvailabilities(toDeleteIds, toCreate);

  return { created: toCreate.length, deleted };
}

/** Soft delete avec vérification d'appartenance. */
export async function deleteAvailability(userId: string, id: string): Promise<boolean> {
  const availability = await storage.getAvailability(id);
  if (!availability || availability.userId !== userId || availability.deletedAt) return false;
  await storage.softDeleteAvailabilities([id]);
  return true;
}
