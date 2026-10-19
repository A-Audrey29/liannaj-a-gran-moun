import { storage } from "../storage";
import { addDaysISO, partsFromISO, gpDateTimeToUtc, gpDayISO, todayISO } from "../../shared/dates";
import {
  availabilityTemplateSchema,
  MAX_RECURRING_RANGE_DAYS,
  type AvailabilityTemplate,
  type CreateRecurringAvailabilitiesInput,
  type CreateDateExceptionInput,
} from "../../shared/schema";
import { overlaps, contains, isSlotCovered } from "../../shared/availability";
import type { Prisma } from "../../generated/prisma/client.ts";

export { overlaps };

/** Longest meeting accepted by the creation schemas (durationMinutes max). */
const MAX_MEETING_MINUTES = 480;

/** Intervalles occupés par des rencontres (début, début + durée). */
function meetingIntervals(interventions: { scheduledDate: Date; durationMinutes: number }[]) {
  return interventions.map((i) => ({
    start: i.scheduledDate,
    end: new Date(i.scheduledDate.getTime() + i.durationMinutes * 60_000),
  }));
}

/**
 * Remplace, sur la fenêtre [from, to] seulement, les disponibilités AVAILABLE
 * du Junior par le planning récurrent fourni. Les créneaux hors fenêtre sont
 * conservés (l'écran annonce « vos N prochaines semaines »). Un créneau qui
 * porte une rencontre prévue (PROPOSED ou CONFIRMED) n'est purgé que si un
 * nouveau créneau le couvre entièrement : la rencontre reste dans les
 * disponibilités, et réenregistrer le même planning ne crée pas de doublon.
 */
export async function createRecurringAvailabilities(
  userId: string,
  input: CreateRecurringAvailabilitiesInput
): Promise<{ created: number; deleted: number }> {
  const windowStart = gpDateTimeToUtc(input.from, 0, 0);
  const windowEnd = gpDateTimeToUtc(addDaysISO(input.to, 1), 0, 0);
  const [existing, planned] = await Promise.all([
    storage.getAvailabilitiesByUser(userId),
    storage.getActiveInterventionsForUser(userId),
  ]);
  const protectedIntervals = meetingIntervals(planned);

  const toCreate = generateSlots(userId, input.from, input.to, input.slots);

  const toDelete = existing.filter(
    (a) =>
      a.kind === "AVAILABLE" &&
      overlaps(a.startAt, a.endAt, windowStart, windowEnd) &&
      (!protectedIntervals.some((p) => overlaps(a.startAt, a.endAt, p.start, p.end)) ||
        toCreate.some((n) => contains(n.startAt, n.endAt, a.startAt, a.endAt)))
  );

  // The weekly pattern is kept on the junior: it pre-fills the form and lets
  // them extend in one click (same transaction as the slots).
  return storage.deleteAndCreateAvailabilities(toDelete.map((a) => a.id), toCreate, {
    userId,
    template: input.slots,
  });
}

/** Créneaux datés du planning habituel, jour par jour sur [from, to] (heures GP). */
function generateSlots(userId: string, fromISO: string, toISO: string, slots: AvailabilityTemplate) {
  const created: { userId: string; startAt: Date; endAt: Date; kind: "AVAILABLE" }[] = [];
  let dayISO = fromISO;
  while (dayISO <= toISO) {
    const { dow } = partsFromISO(dayISO);
    for (const slot of slots) {
      if (slot.dayOfWeek !== dow) continue;
      const [sh, sm] = slot.startTime.split(":").map(Number);
      const [eh, em] = slot.endTime.split(":").map(Number);
      created.push({
        userId,
        startAt: gpDateTimeToUtc(dayISO, sh, sm),
        endAt: gpDateTimeToUtc(dayISO, eh, em),
        kind: "AVAILABLE",
      });
    }
    dayISO = addDaysISO(dayISO, 1);
  }
  return created;
}

/** Planning habituel mémorisé, ou null s'il est absent ou illisible. */
export function parseAvailabilityTemplate(raw: unknown): AvailabilityTemplate | null {
  const parsed = availabilityTemplateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Fin du dernier créneau AVAILABLE déclaré (passé ou futur), ou null. */
export async function lastAvailableEnd(userId: string): Promise<Date | null> {
  const all = await storage.getAvailabilitiesByUser(userId);
  const ends = all.filter((a) => a.kind === "AVAILABLE").map((a) => a.endAt.getTime());
  return ends.length > 0 ? new Date(Math.max(...ends)) : null;
}

export type ExtendResult =
  | { ok: true; created: number; untilISO: string }
  | { ok: false; reason: "NO_TEMPLATE" | "ALREADY_COVERED" };

/**
 * Prolonge le planning habituel de `weeks` semaines après le dernier créneau
 * (ou à partir d'aujourd'hui s'ils sont tous passés). N'efface rien : les
 * semaines déjà couvertes et les absences déclarées restent telles quelles,
 * et aucun créneau n'est créé sur une absence (UNAVAILABLE).
 * Plafond : MAX_RECURRING_RANGE_DAYS après aujourd'hui, comme le formulaire.
 */
export async function extendRecurringAvailabilities(userId: string, weeks: number): Promise<ExtendResult> {
  const user = await storage.getUser(userId);
  const template = parseAvailabilityTemplate(user?.availabilityTemplate);
  if (!template) return { ok: false, reason: "NO_TEMPLATE" };

  const today = todayISO();
  const lastEnd = await lastAvailableEnd(userId);
  // Last covered GP day: the day of the last end (minus 1 ms so a slot ending
  // at midnight belongs to the day before).
  const lastDay = lastEnd ? gpDayISO(new Date(lastEnd.getTime() - 1)) : null;
  const fromISO = lastDay && lastDay >= today ? addDaysISO(lastDay, 1) : today;
  const capISO = addDaysISO(today, MAX_RECURRING_RANGE_DAYS);
  const wantedToISO = addDaysISO(fromISO, weeks * 7 - 1);
  const toISO = wantedToISO < capISO ? wantedToISO : capISO;
  if (fromISO > toISO) return { ok: false, reason: "ALREADY_COVERED" };

  const windowStart = gpDateTimeToUtc(fromISO, 0, 0);
  const windowEnd = gpDateTimeToUtc(addDaysISO(toISO, 1), 0, 0);
  const absences = (await storage.getAvailabilitiesInRange(userId, windowStart, windowEnd)).filter(
    (a) => a.kind === "UNAVAILABLE"
  );
  const toCreate = generateSlots(userId, fromISO, toISO, template).filter(
    (n) => !absences.some((a) => overlaps(a.startAt, a.endAt, n.startAt, n.endAt))
  );

  const { created } = await storage.deleteAndCreateAvailabilities([], toCreate);
  return { ok: true, created, untilISO: toISO };
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
    // PROPOSED too: removing the slot behind a proposal let the junior confirm
    // a meeting outside their availability. They should decline it instead.
    const [existing, planned] = await Promise.all([
      storage.getAvailabilitiesInRange(userId, rangeStart, rangeEnd),
      // A meeting that started before the range can still run into it: look
      // back by the longest possible meeting, the overlap test does the rest.
      storage.getActiveInterventionsForUser(userId, new Date(rangeStart.getTime() - MAX_MEETING_MINUTES * 60_000), rangeEnd),
    ]);
    const protectedIntervals = meetingIntervals(planned);

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

/**
 * Le créneau proposé tombe-t-il dans les disponibilités déclarées par le jeune ?
 *
 * `juniorId` est TOUJOURS le junior de la relation, jamais l'appelant : pour la
 * 1ère rencontre c'est l'Admin qui propose, et ce sont bien les dispos du jeune
 * qui font foi.
 */
export async function isWithinAvailability(
  juniorId: string,
  startAt: Date,
  durationMinutes: number
): Promise<boolean> {
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const availabilities = await storage.getAvailabilitiesInRange(juniorId, startAt, endAt);
  return isSlotCovered(availabilities, startAt, endAt);
}

/**
 * Le créneau entre-t-il en conflit avec une rencontre déjà posée ?
 *
 * PROPOSED compte autant que CONFIRMED : sans ça, deux propositions peuvent
 * viser le même créneau et le jeune se retrouve à devoir arbitrer un doublon.
 */
export async function hasInterventionConflict(
  juniorId: string,
  startAt: Date,
  durationMinutes: number,
  client?: Prisma.TransactionClient
): Promise<boolean> {
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  // Fenêtre élargie en amont : une rencontre commencée avant `startAt` peut
  // déborder dessus. 24h couvre largement la durée max (480 min).
  const windowStart = new Date(startAt.getTime() - 24 * 60 * 60_000);
  const existing = await storage.getActiveInterventionsForUser(juniorId, windowStart, endAt, client);

  return existing.some((i) =>
    overlaps(
      i.scheduledDate,
      new Date(i.scheduledDate.getTime() + i.durationMinutes * 60_000),
      startAt,
      endAt
    )
  );
}

/** Soft delete avec vérification d'appartenance. */
export async function deleteAvailability(userId: string, id: string): Promise<boolean> {
  const availability = await storage.getAvailability(id);
  if (!availability || availability.userId !== userId || availability.deletedAt) return false;
  await storage.softDeleteAvailabilities([id]);
  return true;
}
