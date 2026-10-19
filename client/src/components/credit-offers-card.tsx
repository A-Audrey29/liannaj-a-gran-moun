import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { CREDIT_OFFERS } from "@shared/credit-offers";
import { CONTACT_EMAIL } from "@shared/branding";

/** Where a given role writes to the team: in-app for seniors and aidants. */
export function teamContactHref(role: string | undefined): string {
  if (role === "SENIOR") return "/mon-espace?tab=aide";
  if (role === "REFERENT_SENIOR") return "/espace-referent?tab=contact";
  return `mailto:${CONTACT_EMAIL}`;
}

/**
 * Online payment is open only when a provider is configured on the server.
 * Until then the offers stay visible but buying goes through the team.
 */
export function useOnlinePayment(): boolean | undefined {
  const { data } = useQuery<{ online: boolean }>({
    queryKey: ["/api/credits/payment-status"],
    staleTime: 5 * 60 * 1000,
  });
  return data?.online;
}

export function OffersGrid() {
  const { toast } = useToast();
  const { user } = useAuth();
  const online = useOnlinePayment();
  const mutation = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await apiRequest("POST", "/api/credits/checkout", { offerId });
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        // e.g. 503 "paiement en ligne indisponible": show why, not "réessayez".
        description: apiErrorMessage(err, "Impossible de lancer le paiement. Réessayez."),
      });
    },
  });

  return (
    <div className="space-y-3">
      {CREDIT_OFFERS.map((offer) => (
        <div key={offer.id} className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" data-testid={`text-offer-name-${offer.id}`}>{offer.name}</p>
            <p className="text-sm">{offer.label}</p>
            <p className="text-xs text-muted-foreground">{offer.priceEuros} €</p>
          </div>
          {online && (
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(offer.id)}
              data-testid={`button-buy-${offer.id}`}
            >
              Acheter
            </Button>
          )}
        </div>
      ))}
      {online === false && (
        <p className="text-sm rounded-lg bg-[#f3eaff] px-3 py-2" data-testid="text-buy-via-team">
          Pour acheter des ateliers,{" "}
          <a href={teamContactHref(user?.role)} className="font-semibold text-[#dc4256] underline">
            écrivez à l'équipe
          </a>
          . Elle vous indique comment régler et ajoute vos ateliers à votre compte.
        </p>
      )}
    </div>
  );
}

export function CreditOffersCard() {
  return (
    <Card data-testid="card-credit-offers">
      <CardContent className="pt-6 space-y-3">
        <p className="font-semibold">Acheter des ateliers</p>
        <OffersGrid />
        <Link href="/forfaits" className="inline-block text-sm underline text-[#dc4256]" data-testid="link-forfaits">
          Comment fonctionnent les forfaits ?
        </Link>
      </CardContent>
    </Card>
  );
}
