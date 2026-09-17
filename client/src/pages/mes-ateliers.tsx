import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookOpen, ShoppingCart, Tag } from "lucide-react";
import { useState } from "react";
import { OffersGrid } from "@/components/credit-offers-card";
import type { CreditLedgerEntry } from "@shared/schema";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const MOVEMENT_LABEL: Record<CreditLedgerEntry["type"], string> = {
  PURCHASE: "Achat",
  CONSUMPTION: "Atelier utilisé",
  ADJUSTMENT: "Ajustement",
};

export default function MesAteliers() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [tarifsOpen, setTarifsOpen] = useState(false);

  const { data: balanceData, isLoading: balanceLoading } = useQuery<{ balance: number }>({
    queryKey: ["/api/credits/balance"],
  });
  const { data: history, isLoading: historyLoading } = useQuery<CreditLedgerEntry[]>({
    queryKey: ["/api/credits/history"],
  });

  const isAllowed = user?.role === "SENIOR" || user?.role === "REFERENT_SENIOR";

  if (!isAllowed) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">Page non disponible pour ce compte.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/mon-espace")}>Retour</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={() => setLocation("/mon-espace")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        data-testid="button-back"
      >
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

      <h1 className="text-2xl font-bold mb-6" data-testid="text-mes-ateliers-title">Mes ateliers</h1>

      <Card className="rounded-2xl border-0 shadow-sm mb-6">
        <CardContent className="py-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-[#dc4256]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Solde disponible</p>
              {balanceLoading ? (
                <Skeleton className="h-8 w-24 mt-1" />
              ) : (
                <p className="text-2xl font-bold" data-testid="text-balance">
                  {balanceData?.balance ?? 0} atelier{(balanceData?.balance ?? 0) > 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setTarifsOpen(true)}
              data-testid="button-tarifs"
            >
              <Tag className="w-4 h-4 mr-2" /> Tarifs
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-sm mb-6" data-testid="card-buy-ateliers">
        <CardContent className="pt-6 space-y-3">
          <p className="font-semibold flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" /> Acheter des ateliers
          </p>
          <OffersGrid />
        </CardContent>
      </Card>

      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Historique</h2>
      {historyLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : !history || history.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Aucun mouvement pour le moment
        </div>
      ) : (
        <div className="space-y-2" data-testid="list-history">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3"
              data-testid={`row-history-${entry.id}`}
            >
              <div>
                <p className="text-sm font-medium">{MOVEMENT_LABEL[entry.type]}</p>
                <p className="text-xs text-muted-foreground">{entry.reason}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(entry.createdAt)}</p>
              </div>
              <span className={`text-sm font-bold shrink-0 ${entry.amount > 0 ? "text-green-600" : "text-[#dc4256]"}`}>
                {entry.amount > 0 ? "+" : ""}{entry.amount}
              </span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={tarifsOpen} onOpenChange={setTarifsOpen}>
        <DialogContent data-testid="dialog-tarifs">
          <DialogHeader>
            <DialogTitle>Tarifs des ateliers</DialogTitle>
          </DialogHeader>
          <OffersGrid />
        </DialogContent>
      </Dialog>
    </div>
  );
}
