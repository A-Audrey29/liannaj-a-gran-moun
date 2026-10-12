import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ArrowLeft, BookOpen, ShoppingCart } from "lucide-react";
import { OffersGrid } from "@/components/credit-offers-card";
import type { CreditBalanceResponse, CreditHistoryEntry } from "@shared/credits";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const MOVEMENT_LABEL: Record<CreditHistoryEntry["type"], string> = {
  PURCHASE: "Achat",
  CONSUMPTION: "Atelier utilisé",
  ADJUSTMENT: "Ajustement",
};

export default function MesAteliers() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isAllowed = user?.role === "SENIOR" || user?.role === "REFERENT_SENIOR";
  const homePath = user?.role === "REFERENT_SENIOR" ? "/espace-referent" : "/mon-espace";

  // Errors are shown as errors: a failed request must never read as "0
  // atelier" or "no movement", which is wrong financial information.
  const {
    data: balanceData,
    isLoading: balanceLoading,
    isError: balanceError,
  } = useQuery<CreditBalanceResponse>({ queryKey: ["/api/credits/balance"], enabled: isAllowed, staleTime: 0 });
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
  } = useQuery<CreditHistoryEntry[]>({ queryKey: ["/api/credits/history"], enabled: isAllowed, staleTime: 0 });

  if (!isAllowed) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">Page non disponible pour ce compte.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation(homePath)}>Retour</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={() => setLocation(homePath)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        data-testid="button-back"
      >
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

      <h1 className="text-2xl font-bold mb-6" data-testid="text-mes-ateliers-title">Mes ateliers</h1>

      <Card className="rounded-2xl border-0 shadow-sm mb-6">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-[#dc4256]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ateliers disponibles</p>
              {balanceLoading ? (
                <Skeleton className="h-8 w-24 mt-1" />
              ) : balanceError || !balanceData ? (
                <p className="text-sm text-[#dc4256] mt-1" data-testid="text-balance-error">
                  Impossible de charger votre solde. Réessayez dans un instant.
                </p>
              ) : (
                <>
                  <p className="text-2xl font-bold" data-testid="text-balance">
                    {Math.max(balanceData.available, 0)} atelier{balanceData.available > 1 ? "s" : ""}
                  </p>
                  {balanceData.balance > balanceData.available && balanceData.available >= 0 && (
                    <p className="text-xs text-muted-foreground" data-testid="text-reserved">
                      + {balanceData.balance - balanceData.available} réservé
                      {balanceData.balance - balanceData.available > 1 ? "s" : ""} pour des ateliers déjà prévus
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          {balanceData && balanceData.balance < 0 && (
            <p
              className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-4 flex items-center gap-2"
              data-testid="text-negative-balance"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Solde à régulariser : {balanceData.balance} atelier{balanceData.balance < -1 ? "s" : ""}. Achetez un pack pour
              réserver de nouveaux ateliers.
            </p>
          )}
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
      {historyError ? (
        <p className="text-center py-12 text-[#dc4256]" data-testid="text-history-error">
          Impossible de charger l'historique. Réessayez dans un instant.
        </p>
      ) : historyLoading ? (
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

    </div>
  );
}
