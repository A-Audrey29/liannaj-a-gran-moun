import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CREDIT_OFFERS } from "@shared/credit-offers";

export function OffersGrid() {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await apiRequest("POST", "/api/credits/checkout", { offerId });
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de lancer le paiement. Réessayez.",
      });
    },
  });

  return (
    <div className="space-y-3">
      {CREDIT_OFFERS.map((offer) => (
        <div key={offer.id} className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{offer.label}</p>
            <p className="text-xs text-muted-foreground">{offer.priceEuros} €</p>
          </div>
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(offer.id)}
            data-testid={`button-buy-${offer.id}`}
          >
            Acheter
          </Button>
        </div>
      ))}
    </div>
  );
}

export function CreditOffersCard() {
  return (
    <Card data-testid="card-credit-offers">
      <CardContent className="pt-6 space-y-3">
        <p className="font-semibold">Acheter des ateliers</p>
        <OffersGrid />
      </CardContent>
    </Card>
  );
}
