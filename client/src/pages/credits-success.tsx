import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import type { CheckoutStatusResponse, CreditBalanceResponse } from "@shared/credits";

const POLL_MS = 2000;
const MAX_WAIT_MS = 40_000;

/**
 * Mollie sends the payer back here once the payment page closes, whatever
 * happened there (paid, cancelled, refused). Showing the balance straight
 * away often displayed the old one, as if the payment had been lost: wait
 * until the server confirms the payment is credited (or failed), then refresh
 * every balance shown in the app.
 */
export default function CreditsSuccess() {
  const { user } = useAuth();
  const dashboardPath = user?.role === "REFERENT_SENIOR" ? "/espace-referent" : "/mon-espace";
  const paymentId = new URLSearchParams(window.location.search).get("payment_id");
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const { data: status } = useQuery<CheckoutStatusResponse>({
    queryKey: [`/api/credits/checkout-status?paymentId=${encodeURIComponent(paymentId ?? "")}`],
    enabled: !!paymentId,
    staleTime: 0,
    // "unpaid" keeps polling: the payer may still finish in another tab.
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "credited" || s === "failed" || timedOut ? false : POLL_MS;
    },
  });
  const credited = status?.status === "credited";
  // Left the payment page without paying, or the payment failed: not charged.
  const notPaid = status?.status === "unpaid" || status?.status === "failed";

  useEffect(() => {
    if (credited) queryClient.invalidateQueries({ queryKey: ["/api/credits/balance"] });
  }, [credited]);

  const { data: balance, isLoading } = useQuery<CreditBalanceResponse>({
    queryKey: ["/api/credits/balance"],
    enabled: credited,
    staleTime: 0,
  });

  // Old link without payment id, or the payment is slow: say so plainly.
  const waiting = !credited && !notPaid && !!paymentId && !timedOut;

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
      ) : notPaid ? (
        <>
          <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Paiement non abouti</h1>
          <p className="text-muted-foreground mb-6" data-testid="text-payment-failed">
            Le paiement n'a pas été finalisé. Vous n'avez pas été débité.
          </p>
          <Link href="/forfaits">
            <Button variant="outline" className="w-full mb-3" data-testid="button-retry-purchase">
              Réessayer
            </Button>
          </Link>
        </>
      ) : waiting ? (
        <>
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Vérification du paiement…</h1>
          <p className="text-muted-foreground mb-8" data-testid="text-crediting">
            Cela ne prend que quelques secondes.
          </p>
        </>
      ) : (
        <>
          <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Paiement en cours de confirmation</h1>
          <p className="text-muted-foreground mb-8" data-testid="text-crediting-late">
            Si vous avez payé, vos crédits apparaîtront dans votre espace d'ici quelques minutes.
            Sinon, contactez l'équipe Lyannaj.
          </p>
        </>
      )}
      <Link href={dashboardPath}>
        <Button className="w-full">Retour à mon espace</Button>
      </Link>
    </div>
  );
}
