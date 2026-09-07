import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function CreditsSuccess() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<{ balance: number }>({
    queryKey: ["/api/credits/balance"],
  });
  const dashboardPath = user?.role === "REFERENT_SENIOR" ? "/espace-referent" : "/mon-espace";

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center" data-testid="page-credits-success">
      <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
      <h1 className="text-2xl font-bold mb-2">Paiement confirmé</h1>
      <p className="text-muted-foreground mb-6">Votre achat de crédits a bien été enregistré.</p>
      {isLoading ? (
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-8" />
      ) : (
        <p className="text-3xl font-bold text-[#dc4256] mb-8" data-testid="text-new-balance">
          {data?.balance ?? 0} crédit{(data?.balance ?? 0) > 1 ? "s" : ""}
        </p>
      )}
      <Link href={dashboardPath}>
        <Button className="w-full">Retour à mon espace</Button>
      </Link>
    </div>
  );
}
