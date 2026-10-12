import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDayNumeric, todayISO } from "@shared/dates";
import {
  NPS_MIN_RELIABLE_SAMPLE,
  NPS_SEGMENTS,
  type NpsCategory,
  type NpsReport,
  type NpsSegment,
  type NpsSummary,
} from "@shared/nps";

const CATEGORY_LABELS: Record<NpsCategory, string> = {
  DETRACTOR: "Détracteur",
  PASSIVE: "Passif",
  PROMOTER: "Promoteur",
};

const CATEGORY_COLORS: Record<NpsCategory, string> = {
  DETRACTOR: "bg-red-100 text-red-800",
  PASSIVE: "bg-amber-100 text-amber-800",
  PROMOTER: "bg-green-100 text-green-800",
};

const BAR_COLORS: Record<NpsCategory, string> = {
  DETRACTOR: "bg-red-400",
  PASSIVE: "bg-amber-300",
  PROMOTER: "bg-green-500",
};

const SEGMENT_LABELS: Record<NpsSegment, string> = {
  SENIOR: "Séniors",
  REFERENT_SENIOR: "Référents",
};

function formatNps(nps: number | null): string {
  if (nps === null) return "–";
  return nps > 0 ? `+${nps}` : String(nps);
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function DistributionBar({ summary }: { summary: NpsSummary }) {
  const parts: { category: NpsCategory; count: number }[] = [
    { category: "DETRACTOR", count: summary.detractors },
    { category: "PASSIVE", count: summary.passives },
    { category: "PROMOTER", count: summary.promoters },
  ];
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-muted" role="img" aria-label="Répartition des réponses">
        {parts.map(({ category, count }) => (
          <div key={category} className={BAR_COLORS[category]} style={{ width: `${percent(count, summary.total)}%` }} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-2">
        {parts.map(({ category, count }) => (
          <span key={category}>
            {CATEGORY_LABELS[category]}s : {count} ({percent(count, summary.total)} %)
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SatisfactionTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState<NpsCategory | "all">("all");

  const { data, isLoading, isError } = useQuery<NpsReport>({
    queryKey: ["/api/admin/nps", { from, to }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const query = params.toString();
      const res = await apiRequest("GET", `/api/admin/nps${query ? `?${query}` : ""}`);
      return res.json();
    },
    // An inverted range is refused by the server; wait for a valid one.
    enabled: !from || !to || from <= to,
    // Keep the report on screen while a new period loads (no spinner flash).
    placeholderData: keepPreviousData,
  });

  // The funder gets scores and reasons, never names or emails.
  function exportCSV() {
    if (!data) return;
    const header = ["Date", "Profil", "Note", "Catégorie", "Raison"];
    const rows = data.responses.map((r) => [
      fmtDayNumeric(new Date(r.createdAt)),
      SEGMENT_LABELS[r.segment],
      r.score,
      CATEGORY_LABELS[r.category],
      r.reason ?? "",
    ]);
    // Guadeloupe day, like every date inside the file (not the UTC date).
    downloadCsv(`nps_${todayISO()}.csv`, buildCsv(header, rows));
  }

  const summary = data?.summary;
  const visible = data?.responses.filter((r) => category === "all" || r.category === category) ?? [];

  return (
    <div className="space-y-6" data-testid="tab-content-satisfaction">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="nps-from" className="text-xs">Du</Label>
          <Input id="nps-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-nps-from" />
        </div>
        <div>
          <Label htmlFor="nps-to" className="text-xs">Au</Label>
          <Input id="nps-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-nps-to" />
        </div>
        {(from || to) && (
          <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>
            Toute la période
          </Button>
        )}
        <Button
          variant="outline"
          onClick={exportCSV}
          disabled={!data || data.responses.length === 0}
          className="ml-auto"
          data-testid="button-nps-export"
        >
          <Download className="w-4 h-4 mr-2" />
          Exporter tout en CSV (sans noms)
        </Button>
      </div>

      {from && to && from > to && (
        <p className="text-sm text-[#dc4256]">La date de début doit précéder la date de fin.</p>
      )}
      {isError && <p className="text-sm text-[#dc4256]">Impossible de charger les résultats.</p>}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && summary && (
        <>
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold" data-testid="text-nps-score">{formatNps(summary.nps)}</span>
                <span className="text-muted-foreground" data-testid="text-nps-total">
                  Net Promoter Score · {summary.total} réponse{summary.total > 1 ? "s" : ""}
                </span>
              </div>
              {summary.total > 0 && summary.total < NPS_MIN_RELIABLE_SAMPLE && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2" data-testid="text-nps-warning">
                  Seulement {summary.total} réponse{summary.total > 1 ? "s" : ""} : un seul avis fait varier fortement le score.
                  À interpréter avec prudence en dessous de {NPS_MIN_RELIABLE_SAMPLE} réponses.
                </p>
              )}
              {summary.total === 0 && <p className="text-sm text-muted-foreground">Aucune réponse sur cette période.</p>}
              {summary.total > 0 && <DistributionBar summary={summary} />}
            </CardContent>
          </Card>

          <div className="grid sm:grid-cols-2 gap-3">
            {NPS_SEGMENTS.map((segment) => {
              const s = data.bySegment[segment];
              return (
                <Card key={segment} data-testid={`card-nps-segment-${segment}`}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{SEGMENT_LABELS[segment]}</p>
                    <p className="text-2xl font-bold">{formatNps(s.nps)}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.total} réponse{s.total > 1 ? "s" : ""} · {s.promoters} promoteur{s.promoters > 1 ? "s" : ""} · {s.detractors} détracteur{s.detractors > 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(["all", "DETRACTOR", "PASSIVE", "PROMOTER"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setCategory(value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    category === value ? "bg-[#dc4256] text-white" : "bg-white text-muted-foreground hover:bg-muted"
                  }`}
                  data-testid={`filter-nps-${value}`}
                >
                  {value === "all" ? "Toutes" : `${CATEGORY_LABELS[value]}s`}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Aucune réponse à afficher.</p>
            ) : (
              visible.map((r) => (
                <Card key={r.id} data-testid={`card-nps-response-${r.id}`}>
                  <CardContent className="p-4 flex gap-3 items-start">
                    <Badge className={`${CATEGORY_COLORS[r.category]} shrink-0 text-base px-2.5`}>{r.score}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {r.firstName === null ? (
                          <span className="italic text-muted-foreground">Compte supprimé</span>
                        ) : (
                          `${r.firstName} ${r.lastName}`
                        )}
                        <span className="text-muted-foreground font-normal">
                          {" "}· {SEGMENT_LABELS[r.segment]} · {fmtDayNumeric(new Date(r.createdAt))}
                        </span>
                      </p>
                      {r.reason ? (
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">{r.reason}</p>
                      ) : (
                        <p className="text-sm mt-1 text-muted-foreground italic">Pas de commentaire</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
