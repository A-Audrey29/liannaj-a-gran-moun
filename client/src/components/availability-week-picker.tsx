import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import type { Availability, Intervention } from "@shared/schema";
import { mergeAvailabilities, overlaps, type Interval } from "@shared/availability";
import {
  addDaysISO,
  startOfWeekISO,
  todayISO,
  gpDayISO,
  fmtDayShortISO,
  fmtDayLongMonth,
  fmtTime,
  fmtTimeRange,
} from "@shared/dates";

/** Créneau libre proposé au clic, après retrait des rencontres déjà posées. */
export interface FreeSlot {
  startAt: Date;
  endAt: Date;
}

interface Props {
  juniorId: string;
  juniorName: string;
  /** Rencontres déjà planifiées sur la relation — affichées et soustraites. */
  interventions: Intervention[];
  /** null quand l'utilisateur ne peut pas proposer (lecture seule). */
  onPickSlot: ((slot: FreeSlot) => void) | null;
}

/**
 * Soustrait les rencontres déjà posées des plages disponibles.
 *
 * Le serveur refuse les chevauchements ; sans cette soustraction l'UI
 * proposerait des créneaux voués au 400.
 */
function subtractBusy(free: Interval[], busy: Interval[]): Interval[] {
  let result = free;
  for (const b of busy) {
    const next: Interval[] = [];
    for (const f of result) {
      if (!overlaps(f.startAt, f.endAt, b.startAt, b.endAt)) {
        next.push(f);
        continue;
      }
      if (f.startAt < b.startAt) next.push({ startAt: f.startAt, endAt: b.startAt });
      if (f.endAt > b.endAt) next.push({ startAt: b.endAt, endAt: f.endAt });
    }
    result = next;
  }
  // Un résidu de moins de 30 min ne peut porter aucune rencontre (durée min).
  return result.filter((s) => s.endAt.getTime() - s.startAt.getTime() >= 30 * 60_000);
}

export default function AvailabilityWeekPicker({ juniorId, juniorName, interventions, onPickSlot }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(todayISO()));
  const [pickedSlot, setPickedSlot] = useState<FreeSlot | null>(null);

  const { data: availabilities, isLoading } = useQuery<Availability[]>({
    queryKey: [`/api/users/${juniorId}/availabilities`],
  });

  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
  const weekEnd = addDaysISO(weekStart, 7);

  const busy: Interval[] = interventions
    .filter((i) => i.status === "PROPOSED" || i.status === "CONFIRMED")
    .map((i) => {
      const startAt = new Date(i.scheduledDate);
      return { startAt, endAt: new Date(startAt.getTime() + i.durationMinutes * 60_000) };
    });

  const merged = mergeAvailabilities(availabilities || []);
  const freeSlots = subtractBusy(merged, busy).filter((s) => s.endAt.getTime() > Date.now());

  const slotsByDay = new Map<string, Interval[]>();
  for (const slot of freeSlots) {
    const key = gpDayISO(slot.startAt);
    if (!slotsByDay.has(key)) slotsByDay.set(key, []);
    slotsByDay.get(key)!.push(slot);
  }

  const busyByDay = new Map<string, Interval[]>();
  for (const b of busy) {
    const key = gpDayISO(b.startAt);
    if (!busyByDay.has(key)) busyByDay.set(key, []);
    busyByDay.get(key)!.push(b);
  }

  const hasAnySlotThisWeek = days.some((d) => (slotsByDay.get(d)?.length || 0) > 0);
  const declaredNothing = !isLoading && merged.length === 0;

  return (
    <Card className="rounded-2xl border-0 shadow-sm mb-6">
      <CardContent className="py-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-base font-bold flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[#8b5cf6]" />
            Disponibilités de {juniorName}
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full h-8 w-8 p-0"
              onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
              aria-label="Semaine précédente"
              data-testid="button-prev-week"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2 min-w-[130px] text-center">
              {fmtDayShortISO(weekStart)} – {fmtDayShortISO(addDaysISO(weekEnd, -1))}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full h-8 w-8 p-0"
              onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
              aria-label="Semaine suivante"
              data-testid="button-next-week"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : declaredNothing ? (
          <p className="text-sm text-muted-foreground">
            {juniorName} n'a pas encore indiqué ses disponibilités. Vous pourrez proposer une
            rencontre dès qu'il ou elle en aura déclaré.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
              {days.map((day) => {
                const slots = slotsByDay.get(day) || [];
                const taken = busyByDay.get(day) || [];
                const isToday = day === todayISO();
                const isSelectedDay = pickedSlot ? gpDayISO(pickedSlot.startAt) === day : false;
                return (
                  <div key={day} className="min-w-0">
                    <div
                      className={`font-semibold uppercase tracking-wide mb-1.5 transition-all ${
                        isSelectedDay
                          ? "text-sm text-[#8b5cf6]"
                          : `text-[11px] ${isToday ? "text-[#8b5cf6]" : "text-muted-foreground"}`
                      }`}
                    >
                      {fmtDayShortISO(day)}
                    </div>
                    <div className="space-y-1.5">
                      {slots.map((s, i) => (
                        <button
                          key={`free-${i}`}
                          type="button"
                          disabled={!onPickSlot}
                          onClick={() => {
                            setPickedSlot({ startAt: s.startAt, endAt: s.endAt });
                            onPickSlot?.({ startAt: s.startAt, endAt: s.endAt });
                          }}
                          className="w-full text-left rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1.5 text-xs font-medium text-emerald-900 enabled:hover:bg-emerald-100 enabled:hover:border-emerald-300 disabled:cursor-default transition-colors"
                          data-testid={`slot-free-${day}-${i}`}
                        >
                          {fmtTimeRange(s.startAt, s.endAt)}
                        </button>
                      ))}
                      {taken.map((b, i) => (
                        <div
                          key={`busy-${i}`}
                          className="rounded-lg bg-[#f3eaff] border border-[#e0cffe] px-2 py-1.5 text-xs text-[#6d4aa8]"
                          data-testid={`slot-busy-${day}-${i}`}
                        >
                          {fmtTime(b.startAt)} · prévu
                        </div>
                      ))}
                      {slots.length === 0 && taken.length === 0 && (
                        <div className="rounded-lg bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">—</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!hasAnySlotThisWeek && (
              <p className="text-sm text-muted-foreground mt-4">
                Aucun créneau libre cette semaine. Utilisez les flèches pour changer de semaine.
              </p>
            )}
            {onPickSlot && hasAnySlotThisWeek && !pickedSlot && (
              <p className="text-xs text-muted-foreground mt-4">
                Cliquez un créneau vert pour proposer une rencontre.
              </p>
            )}
            {pickedSlot && (
              <p className="text-sm font-medium text-[#8b5cf6] mt-4" data-testid="text-selected-slot-summary">
                Vous avez sélectionné le {fmtDayLongMonth(pickedSlot.startAt)} à {fmtTime(pickedSlot.startAt)}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
