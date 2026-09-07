import { Link } from "wouter";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function CreditsCancel() {
  const { user } = useAuth();
  const dashboardPath = user?.role === "REFERENT_SENIOR" ? "/espace-referent" : "/mon-espace";

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center" data-testid="page-credits-cancel">
      <XCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
      <h1 className="text-2xl font-bold mb-2">Paiement annulé</h1>
      <p className="text-muted-foreground mb-8">Aucun montant n'a été débité.</p>
      <Link href={dashboardPath}>
        <Button className="w-full">Retour à mon espace</Button>
      </Link>
    </div>
  );
}
