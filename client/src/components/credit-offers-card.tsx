import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { ShoppingCart } from "lucide-react";
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

/** Starts a checkout for one offer and sends the buyer to the payment page. */
export function useCheckout() {
  const { toast } = useToast();
  // Stays true once the payment page is on its way: the mutation itself goes
  // back to "idle" right away, and a second click would open a second checkout.
  const [redirecting, setRedirecting] = useState(false);
  const mutation = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await apiRequest("POST", "/api/credits/checkout", { offerId });
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      setRedirecting(true);
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
  return { mutate: mutation.mutate, variables: mutation.variables, isPending: mutation.isPending || redirecting };
}

/** Dashboard entry point: one clear button to the page that explains how buying works. */
export function CreditOffersCard() {
  return (
    <Card data-testid="card-credit-offers">
      <CardContent className="pt-6 space-y-3">
        <p className="font-semibold">Acheter des ateliers</p>
        <p className="text-sm text-muted-foreground">1 crédit = 1 atelier. Choisissez un forfait, on vous explique chaque étape.</p>
        <BuyAteliersButton className="w-full sm:w-auto" />
      </CardContent>
    </Card>
  );
}

export const BUY_ATELIERS_PATH = "/forfaits";

export function BuyAteliersButton({ className }: { className?: string }) {
  return (
    <Link href={BUY_ATELIERS_PATH}>
      <Button className={`rounded-full ${className ?? ""}`} data-testid="button-buy-ateliers">
        <ShoppingCart className="w-4 h-4 mr-2" aria-hidden="true" /> Acheter des ateliers
      </Button>
    </Link>
  );
}
