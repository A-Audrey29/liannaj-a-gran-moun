import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, Download, Loader2, ChevronRight, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/status-badge";
import StarRating from "@/components/star-rating";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { fmtTime, gpParts } from "@/lib/availability-format";
import { MOIS_LONGS } from "@shared/dates";
import type { MeetingHistoryEntry, MeetingHistoryResponse, Role } from "@shared/schema";

/**
 * Historique + récap des rencontres, partagé par toutes les interfaces.
 *
 * Le composant ne décide d'aucun droit : le serveur a déjà restreint le
 * périmètre et vidé les feedbacks non lisibles. Un champ à `null` s'affiche donc
 * simplement comme absent, sans que le client ait à savoir pourquoi.
 */

type Scope = { kind: "me" } | { kind: "user"; userId: string };

interface MeetingHistoryProps {
  scope: Scope;
  viewerRole: Role;
  /** Rendu d'actions propres à l'appelant (ex. bouton « Confirmer » du jeune). */
  renderActions?: (entry: MeetingHistoryEntry) => React.ReactNode;
  showExport?: boolean;
  emptyLabel?: string;
  /** Suffixe du nom de fichier CSV, ex. le nom de l'élève. */
  exportLabel?: string;
}

const STATUS_FILTERS = [
  { id: "all", label: "Toutes" },
  { id: "PROPOSED", label: "Proposées" },
  { id: "CONFIRMED", label: "Confirmées" },
  { id: "COMPLETED_PENDING_FEEDBACK", label: "Feedback attendu" },
  { id: "COMPLETED", label: "Terminées" },
  { id: "CANCELLED", label: "Annulées" },
];

/** Passée et jamais clôturée par les participants : à traiter par un admin. */
function isOverdue(entry: MeetingHistoryEntry): boolean {
  return (
    (entry.status === "PROPOSED" || entry.status === "CONFIRMED") &&
    new Date(entry.scheduledDate).getTime() < Date.now()
  );
}

/** 135 → "2h15", 120 → "2h", 45 → "45 min". */
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function fmtDateNumeric(date: Date): string {
  const p = gpParts(date);
  return `${String(p.d).padStart(2, "0")}/${String(p.mo + 1).padStart(2, "0")}/${p.y}`;
}

/** "19 août 2026" — heure Guadeloupe, jamais toLocale* (cf. shared/dates.ts). */
function fmtDateLong(date: Date): string {
  const p = gpParts(date);
  return `${p.d} ${MOIS_LONGS[p.mo]} ${p.y}`;
}

export default function MeetingHistory({
  scope,
  viewerRole,
  renderActions,
  showExport = true,
  emptyLabel = "Aucune rencontre",
  exportLabel,
}: MeetingHistoryProps) {
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryKey =
    scope.kind === "me"
      ? ["/api/meetings/history"]
      : ["/api/meetings/history", `?userId=${scope.userId}`];

  const { data, isLoading } = useQuery<MeetingHistoryResponse>({
    queryKey,
    queryFn: async () => {
      const url =
        scope.kind === "me"
          ? "/api/meetings/history"
          : `/api/meetings/history?userId=${encodeURIComponent(scope.userId)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const entries = data?.entries ?? [];
  const summary = data?.summary;
  const overdueCount = entries.filter(isOverdue).length;
  const filtered =
    filter === "all"
      ? entries
      : filter === "OVERDUE"
        ? entries.filter(isOverdue)
        : entries.filter((e) => e.status === filter);

  function exportCSV() {
    const header = [
      "Sénior", "Jeune", "Date", "Heure", "Durée (min)", "Lieu", "Services",
      "Statut", "Note sénior", "Commentaire sénior", "Note jeune", "Commentaire jeune",
    ];
    const rows = filtered.map((e) => [
      e.seniorName,
      e.juniorName,
      fmtDateNumeric(new Date(e.scheduledDate)),
      fmtTime(new Date(e.scheduledDate)),
      e.durationMinutes,
      e.location || "",
      e.tasks.join(", "),
      e.status,
      e.seniorRating ?? "",
      e.seniorComment || "",
      e.juniorRating ?? "",
      e.juniorComment || "",
    ]);
    const suffix = exportLabel ? `_${exportLabel.replace(/\s+/g, "-")}` : "";
    downloadCsv(
      `rencontres${suffix}_${new Date().toISOString().split("T")[0]}.csv`,
      buildCsv(header, rows),
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="meeting-history">
      {summary && summary.totalMeetings > 0 && (
        <Card className="rounded-2xl border-0 shadow-sm bg-muted/30">
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-6 mb-3">
              <div>
                <p className="text-2xl font-bold" data-testid="summary-total-meetings">
                  {summary.totalMeetings}
                </p>
                <p className="text-xs text-muted-foreground">
                  rencontre{summary.totalMeetings > 1 ? "s" : ""} réalisée{summary.totalMeetings > 1 ? "s" : ""}
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="summary-total-hours">
                  {fmtDuration(summary.totalMinutes)}
                </p>
                <p className="text-xs text-muted-foreground">au total</p>
              </div>
            </div>

            {summary.byService.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Heures par service
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {summary.byService.map((s) => (
                    <span
                      key={s.service}
                      className="inline-block bg-primary/10 text-primary text-[11px] px-2 py-0.5 rounded-full"
                    >
                      {s.service} · {fmtDuration(s.minutes)} ({s.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 items-start flex-wrap">
        <div className="flex gap-2 flex-wrap flex-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f.id
                  ? "bg-[#dc4256] text-white"
                  : "bg-white text-muted-foreground hover:bg-muted border"
              }`}
              data-testid={`filter-history-${f.id}`}
            >
              {f.label}
            </button>
          ))}
          {viewerRole === "ADMIN" && overdueCount > 0 && (
            <button
              onClick={() => setFilter("OVERDUE")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === "OVERDUE"
                  ? "bg-red-600 text-white"
                  : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
              }`}
              data-testid="filter-history-OVERDUE"
            >
              À traiter ({overdueCount})
            </button>
          )}
        </div>
        {showExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="shrink-0"
            data-testid="btn-export-history-csv"
          >
            <Download className="w-4 h-4 mr-1" /> Exporter CSV
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <MeetingRow
              key={entry.id}
              entry={entry}
              viewerRole={viewerRole}
              isExpanded={expandedId === entry.id}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              renderActions={renderActions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingRow({
  entry,
  viewerRole,
  isExpanded,
  onToggle,
  renderActions,
}: {
  entry: MeetingHistoryEntry;
  viewerRole: Role;
  isExpanded: boolean;
  onToggle: () => void;
  renderActions?: (entry: MeetingHistoryEntry) => React.ReactNode;
}) {
  const date = new Date(entry.scheduledDate);
  const hasSeniorFeedback = entry.seniorRating !== null || entry.seniorComment !== null;
  const hasJuniorFeedback = entry.juniorRating !== null || entry.juniorComment !== null;
  const hasAnyFeedback = hasSeniorFeedback || hasJuniorFeedback;
  const actions = renderActions?.(entry);

  return (
    <Card className="rounded-xl border shadow-none" data-testid={`meeting-${entry.id}`}>
      <CardContent className="py-3 px-4">
        <button className="w-full text-left" onClick={onToggle} data-testid={`toggle-meeting-${entry.id}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{fmtDateLong(date)}</p>
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground mt-0.5">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {fmtTime(date)} · {fmtDuration(entry.durationMinutes)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {entry.seniorName} — {entry.juniorName}
                </span>
                {entry.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {entry.location}
                  </span>
                )}
              </div>
              {entry.tasks.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {entry.tasks.map((task, i) => (
                    <span
                      key={i}
                      className="inline-block bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full"
                    >
                      {task}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isOverdue(entry) && (
                <Badge
                  variant="outline"
                  className="text-xs font-medium bg-red-100 text-red-800 border-red-200"
                  data-testid={`badge-overdue-${entry.id}`}
                >
                  En retard
                </Badge>
              )}
              <StatusBadge status={entry.status} />
              <ChevronRight
                className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
            </div>
          </div>
        </button>

        {actions && <div className="mt-3 pt-2 border-t">{actions}</div>}

        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {!hasAnyFeedback ? (
              <p className="text-xs text-muted-foreground italic">Aucun feedback pour cette rencontre.</p>
            ) : (
              <>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {viewerRole === "SENIOR" || viewerRole === "JUNIOR" ? "Votre feedback" : "Feedbacks"}
                </p>
                {hasSeniorFeedback && (
                  <FeedbackBlock
                    label={`Sénior (${entry.seniorName})`}
                    rating={entry.seniorRating}
                    comment={entry.seniorComment}
                    className="bg-blue-50 border-blue-100 text-blue-900"
                  />
                )}
                {hasJuniorFeedback && (
                  <FeedbackBlock
                    label={`Jeune (${entry.juniorName})`}
                    rating={entry.juniorRating}
                    comment={entry.juniorComment}
                    className="bg-teal-50 border-teal-100 text-teal-900"
                  />
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedbackBlock({
  label,
  rating,
  comment,
  className,
}: {
  label: string;
  rating: number | null;
  comment: string | null;
  className: string;
}) {
  return (
    <div className={`p-3 rounded-lg border ${className}`}>
      <p className="text-xs font-medium mb-1.5">{label}</p>
      {rating !== null ? (
        <StarRating value={rating} readonly size={14} />
      ) : (
        <p className="text-xs italic opacity-70">Note non renseignée</p>
      )}
      {comment && <p className="text-xs mt-1.5 italic">"{comment}"</p>}
    </div>
  );
}
