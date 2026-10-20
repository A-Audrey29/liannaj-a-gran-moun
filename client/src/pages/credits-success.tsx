import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import type { CheckoutStatusResponse, CreditBalanceResponse } from "@shared/credits";

const POLL_MS = 2000;
const MAX_WAIT_MS = 40_000;

/**
 * Stripe redirects here before (or while) its webhook credits the account.
 * Showing the balance straight away often displayed the old one, as if the
 * payment had been lost: wait until the server confirms the session is
 * credited, then refresh every balance shown in the app.
 */
export default function CreditsSuccess() {
  const { user } = useAuth();
  const dashboardPath = user?.role === "REFERENT_SENIOR" ? "/espace-referent" : "/mon-espace";
  const sessionId = new URLSearchParams(window.location.search).get("session_id");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const { data: status } = useQuery<CheckoutStatusResponse>({
    queryKey: [`/api/credits/checkout-status?sessionId=${encodeURIComponent(sessionId ?? "")}`],
    enabled: !!sessionId,
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.credited || timedOut ? false : POLL_MS),
  });
  const credited = status?.credited === true;

  useEffect(() => {
    if (credited) queryClient.invalidateQueries({ queryKey: ["/api/credits/balance"] });
  }, [credited]);

  const { data: balance, isLoading } = useQuery<CreditBalanceResponse>({
    queryKey: ["/api/credits/balance"],
    enabled: credited,
    staleTime: 0,
  });

  // Old link without session id, or the webhook is late: say so plainly.
  const waiting = !credited && !!sessionId && !timedOut;

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center" data-testid="page-credits-success">
      {credited ? (
        <>
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Paiement confirmé</h1>
          <p className="text-muted-foreground mb-6">Vos crédits ont bien été ajoutés.</p>
          {isLoading || !balance ? (
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-8" />
          ) : (
            <p className="text-3xl font-bold text-primary mb-8" data-testid="text-new-balance">
              {balance.available} atelier{balance.available > 1 ? "s" : ""} disponible{balance.available > 1 ? "s" : ""}
            </p>
          )}
        </>
      ) : waiting ? (
        <>
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Paiement reçu</h1>
          <p className="text-muted-foreground mb-8" data-testid="text-crediting">
            Vos crédits sont en cours d'ajout, cela ne prend que quelques secondes…
          </p>
        </>
      ) : (
        <>
          <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Paiement reçu</h1>
          <p className="text-muted-foreground mb-8" data-testid="text-crediting-late">
            Vos crédits apparaîtront dans votre espace d'ici quelques minutes. Si ce n'est pas le cas,
            contactez l'équipe : votre paiement est bien enregistré chez notre prestataire.
          </p>
        </>
      )}
      <Link href={dashboardPath}>
        <Button className="w-full">Retour à mon espace</Button>
      </Link>
    </div>
  );
}
