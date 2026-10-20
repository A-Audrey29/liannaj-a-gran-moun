import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, apiErrorMessage, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarWidget } from "@/components/ui/calendar";
import { Calendar, Plus, Trash2, AlertTriangle, CalendarPlus } from "lucide-react";
import type { Availability, AvailabilityTemplate } from "@shared/schema";
import { fmtDayLong, fmtTime, gpDecimalHour, JOURS_LONGS } from "@/lib/availability-format";
import { gpDateTimeToUtc, gpDayISO, todayISO, addDaysISO, fmtDayLongMonth } from "@shared/dates";

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 20;
const PX_PER_HOUR = 44;
const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * PX_PER_HOUR;

/** Position/hauteur en px d'un créneau dans la grille horaire, clampé aux bornes affichées. */
function blockStyle(start: Date, end: Date): { top: number; height: number } {
  const startH = Math.min(Math.max(gpDecimalHour(start), GRID_START_HOUR), GRID_END_HOUR);
  const endH = Math.min(Math.max(gpDecimalHour(end), GRID_START_HOUR), GRID_END_HOUR);
  const top = (startH - GRID_START_HOUR) * PX_PER_HOUR;
  const height = Math.max((endH - startH) * PX_PER_HOUR, 6);
  return { top, height };
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // lundi -> dimanche, dow 0=dim (convention dates.ts)

const DUREE_OPTIONS = [
  { weeks: 2, label: "2 semaines" },
  { weeks: 4, label: "4 semaines" },
  { weeks: 8, label: "8 semaines" },
  { weeks: 12, label: "12 semaines" },
];

const SOMMAIRE = [
  { id: "section-recurrentes", label: "1. Dispos récurrentes" },
  { id: "section-calendrier", label: "2. Calendrier" },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function DisponibilitesTab() {
  const { data: availabilities, isLoading } = useQuery<Availability[]>({
    queryKey: ["/api/availabilities/me"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-0 shadow-sm bg-[#f3eaff]">
        <CardContent className="py-4">
          <p className="text-sm text-[#5b3a94]">
            Indiquez vos jours et horaires habituels. Les séniors et l'équipe verront quand vous êtes disponible pour proposer une rencontre.
          </p>
        </CardContent>
      </Card>

      <nav className="flex flex-wrap justify-center gap-2" aria-label="Sommaire">
        {SOMMAIRE.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollToSection(s.id)}
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-white border border-[#e0d0ff] text-[#5b3a94] shadow-sm hover:bg-[#f3eaff] transition-colors"
            data-testid={`link-sommaire-${s.id}`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div id="section-recurrentes">
        <RecurringForm />
      </div>

      <div id="section-calendrier">
        <CalendarView availabilities={availabilities || []} />
      </div>
    </div>
  );
}

/** Extension proposed in one click (POST /api/availabilities/extend). */
const EXTEND_WEEKS = 4;

interface TemplateResponse {
  slots: AvailabilityTemplate | null;
  lastEndAt: string | null;
}

function RecurringForm() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<Record<number, boolean>>({});
  const [times, setTimes] = useState<Record<number, { start: string; end: string }>>({});
  const [weeks, setWeeks] = useState(4);
  const [prefilled, setPrefilled] = useState(false);

  const { data: template } = useQuery<TemplateResponse>({ queryKey: ["/api/availabilities/template"] });

  // The saved weekly pattern pre-fills the form: it used to come back empty,
  // and the junior had to retype everything to extend.
  useEffect(() => {
    if (prefilled || !template?.slots) return;
    setEnabled(Object.fromEntries(template.slots.map((s) => [s.dayOfWeek, true])));
    setTimes(Object.fromEntries(template.slots.map((s) => [s.dayOfWeek, { start: s.startTime, end: s.endTime }])));
    setPrefilled(true);
  }, [template, prefilled]);

  const lastEnd = template?.lastEndAt ? new Date(template.lastEndAt) : null;
  // Last covered day (a slot ending at midnight belongs to the day before).
  const lastDay = lastEnd ? new Date(lastEnd.getTime() - 1) : null;
  const daysLeft = lastEnd ? Math.ceil((lastEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;

  const from = todayISO();
  const to = addDaysISO(from, weeks * 7 - 1);

  function refreshAvailabilities() {
    queryClient.invalidateQueries({ queryKey: ["/api/availabilities/me"] });
    queryClient.invalidateQueries({ queryKey: ["/api/availabilities/template"] });
  }

  const submit = useMutation({
    mutationFn: async () => {
      const slots = DAY_ORDER.filter((dow) => enabled[dow]).map((dow) => ({
        dayOfWeek: dow,
        startTime: times[dow]?.start || "09:00",
        endTime: times[dow]?.end || "12:00",
      }));
      await apiRequest("POST", "/api/availabilities/recurring", { from, to, slots });
    },
    onSuccess: () => {
      refreshAvailabilities();
      toast({ title: "Planning enregistré", description: `Vos disponibilités des ${weeks} prochaines semaines sont à jour.` });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'enregistrer le planning.", variant: "destructive" }),
  });

  const extend = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/availabilities/extend", { weeks: EXTEND_WEEKS });
      return res.json() as Promise<{ untilISO: string }>;
    },
    onSuccess: (data) => {
      refreshAvailabilities();
      toast({
        title: "Planning prolongé",
        description: `Vos disponibilités vont maintenant jusqu'au ${fmtDayLongMonth(gpDateTimeToUtc(data.untilISO, 12, 0))}.`,
      });
    },
    onError: (err) =>
      toast({ title: "Impossible de prolonger", description: apiErrorMessage(err, "Réessayez dans un instant."), variant: "destructive" }),
  });

  const anyEnabled = DAY_ORDER.some((dow) => enabled[dow]);

  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="py-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Mon planning habituel</h4>
        <p className="text-xs text-muted-foreground mb-4">Cochez les jours où vous êtes disponible, et indiquez l'horaire.</p>

        {lastDay && (
          <div
            className={`rounded-xl px-4 py-3 mb-4 text-sm border ${
              daysLeft !== null && daysLeft <= 15
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-[#f3eaff] border-transparent text-gray-800"
            }`}
            data-testid="box-availability-end"
          >
            <p className="flex items-start gap-2">
              {daysLeft !== null && daysLeft <= 15 && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
              <span>
                {daysLeft !== null && daysLeft <= 0
                  ? <>Vos créneaux se sont arrêtés le <strong>{fmtDayLongMonth(lastDay)}</strong> : les séniors ne peuvent plus vous proposer de rencontre.</>
                  : <>Vos créneaux vont jusqu'au <strong>{fmtDayLongMonth(lastDay)}</strong>.</>}
              </span>
            </p>
            {template?.slots ? (
              <Button
                size="sm"
                className="mt-3 rounded-full bg-[#c0354a] hover:bg-[#a82b3d] text-white"
                onClick={() => extend.mutate()}
                disabled={extend.isPending}
                data-testid="button-extend-availability"
              >
                <CalendarPlus className="w-4 h-4 mr-1.5" />
                {extend.isPending ? "Prolongation..." : `Prolonger de ${EXTEND_WEEKS} semaines`}
              </Button>
            ) : (
              <p className="mt-2 text-xs">Enregistrez votre planning habituel ci-dessous : vous pourrez ensuite le prolonger en un clic.</p>
            )}
          </div>
        )}

        <div className="mb-4">
          <Label className="text-xs text-muted-foreground mb-1 block">Durée du planning à générer</Label>
          <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
            <SelectTrigger className="w-44" data-testid="select-duree-planning">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DUREE_OPTIONS.map((opt) => (
                <SelectItem key={opt.weeks} value={String(opt.weeks)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {DAY_ORDER.map((dow) => (
            <div key={dow} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 border-b border-border/50 last:border-0">
              <Switch
                checked={!!enabled[dow]}
                onCheckedChange={(v) => setEnabled((prev) => ({ ...prev, [dow]: v }))}
                data-testid={`switch-day-${dow}`}
              />
              <span className="w-24 shrink-0 text-sm font-medium">{JOURS_LONGS[dow]}</span>
              {enabled[dow] && (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={times[dow]?.start || "09:00"}
                    onChange={(e) => setTimes((prev) => ({ ...prev, [dow]: { start: e.target.value, end: prev[dow]?.end || "12:00" } }))}
                    className="w-28"
                    data-testid={`input-start-${dow}`}
                  />
                  <span className="text-muted-foreground text-sm">à</span>
                  <Input
                    type="time"
                    value={times[dow]?.end || "12:00"}
                    onChange={(e) => setTimes((prev) => ({ ...prev, [dow]: { start: prev[dow]?.start || "09:00", end: e.target.value } }))}
                    className="w-28"
                    data-testid={`input-end-${dow}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <Button
          className="mt-4 rounded-full bg-[#c0354a] hover:bg-[#a82b3d] text-white"
          onClick={() => submit.mutate()}
          disabled={submit.isPending || !anyEnabled}
          data-testid="button-save-recurring"
        >
          {submit.isPending ? "Enregistrement..." : "Enregistrer mon planning"}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Clé du jour GP pour un instant UTC réel (ex: Availability.startAt). */
function dayKey(d: Date): string {
  return gpDayISO(d);
}

/** Clé du jour pour un Date "calendrier" local (ex: `selected` du day-picker, pas un instant réel). */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CalendarView({ availabilities }: { availabilities: Availability[] }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Date | undefined>(new Date());
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("12:00");

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/availabilities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availabilities/me"] });
      toast({ title: "Créneau supprimé" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: async ({ date, startTime, endTime }: { date: Date; startTime: string; endTime: string }) => {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const dayISO = localDayKey(date);
      const startAt = gpDateTimeToUtc(dayISO, sh, sm);
      const endAt = gpDateTimeToUtc(dayISO, eh, em);
      await apiRequest("POST", "/api/availabilities", {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        kind: "AVAILABLE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availabilities/me"] });
      toast({ title: "Créneau ajouté" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible d'ajouter ce créneau.", variant: "destructive" }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Availability[]>();
    for (const a of availabilities) {
      const key = dayKey(new Date(a.startAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    }
    return map;
  }, [availabilities]);

  const availableDays = useMemo(
    () => [...byDay.entries()].filter(([, list]) => list.some((a) => a.kind === "AVAILABLE")).map(([key]) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(y, m - 1, d);
    }),
    [byDay]
  );
  const unavailableDays = useMemo(
    () => [...byDay.entries()].filter(([, list]) => list.every((a) => a.kind === "UNAVAILABLE")).map(([key]) => {
      const [y, m, d] = key.split("-").map(Number);
      return new Date(y, m - 1, d);
    }),
    [byDay]
  );

  const selectedSlots = selected ? byDay.get(localDayKey(selected)) || [] : [];

  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="py-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Mon calendrier</h4>
        <p className="text-xs text-muted-foreground mb-4">Cliquez sur un jour pour voir le détail de vos créneaux.</p>

        <div className="flex flex-col lg:flex-row gap-6">
          <CalendarWidget
            mode="single"
            weekStartsOn={1}
            selected={selected}
            onSelect={setSelected}
            modifiers={{ available: availableDays, unavailable: unavailableDays }}
            modifiersClassNames={{
              available: "bg-emerald-100 text-emerald-800 font-semibold",
              unavailable: "bg-muted text-muted-foreground line-through",
            }}
            className="rounded-xl border self-start"
            data-testid="calendar-availabilities"
          />

          <div className="flex-1 min-w-0">
            {!selected ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sélectionnez un jour.</p>
            ) : (
              <div>
                <h5 className="text-sm font-medium mb-2">{fmtDayLong(selected)}</h5>

                <div className="flex items-end gap-2 mb-4 flex-wrap">
                  <div>
                    <Label htmlFor="new-slot-start" className="text-xs text-muted-foreground mb-1 block">Début</Label>
                    <Input
                      id="new-slot-start"
                      type="time"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                      className="w-28"
                      data-testid="input-new-slot-start"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-slot-end" className="text-xs text-muted-foreground mb-1 block">Fin</Label>
                    <Input
                      id="new-slot-end"
                      type="time"
                      value={newEnd}
                      onChange={(e) => setNewEnd(e.target.value)}
                      className="w-28"
                      data-testid="input-new-slot-end"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => selected && addMutation.mutate({ date: selected, startTime: newStart, endTime: newEnd })}
                    disabled={addMutation.isPending || newEnd <= newStart}
                    data-testid="button-add-slot"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Ajouter
                  </Button>
                </div>

                {selectedSlots.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-6">
                    <Calendar className="w-10 h-10 mx-auto mb-2 text-muted-foreground/50" />
                    Aucun créneau déclaré pour {fmtDayLong(selected).toLowerCase()}.
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative shrink-0" style={{ width: 32, height: GRID_HEIGHT }}>
                      {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i).map(
                        (h) => (
                          <div
                            key={h}
                            className="absolute right-1 -translate-y-1/2 text-xs text-muted-foreground"
                            style={{ top: (h - GRID_START_HOUR) * PX_PER_HOUR }}
                          >
                            {h}h
                          </div>
                        )
                      )}
                    </div>
                    <div className="relative flex-1 min-w-0 rounded-lg bg-muted/20" style={{ height: GRID_HEIGHT }}>
                      {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => i).map((i) => (
                        <div
                          key={i}
                          className="absolute inset-x-0 border-t border-muted/40"
                          style={{ top: i * PX_PER_HOUR }}
                        />
                      ))}
                      {selectedSlots.map((a) => {
                        const startAt = new Date(a.startAt);
                        const endAt = new Date(a.endAt);
                        const { top, height } = blockStyle(startAt, endAt);
                        return (
                          <div
                            key={a.id}
                            className={`absolute inset-x-1 rounded-md px-2 py-1 text-xs flex items-center justify-between gap-1 overflow-hidden ${
                              a.kind === "AVAILABLE"
                                ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                                : "bg-muted/60 border border-muted text-muted-foreground"
                            }`}
                            style={{ top, height }}
                            data-testid={`row-availability-${a.id}`}
                          >
                            <span className="truncate">
                              {fmtTime(startAt)} – {fmtTime(endAt)}
                              {a.kind === "UNAVAILABLE" && <span className="italic"> · indisponible</span>}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive md:h-6 md:w-6"
                              aria-label="Supprimer ce créneau"
                              onClick={() => deleteMutation.mutate(a.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-${a.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
