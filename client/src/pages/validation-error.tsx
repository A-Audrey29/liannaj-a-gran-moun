import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useSearch } from "wouter";
import { AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ValidationError() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const reason = params.get("reason");
  const email = params.get("email");
  const { toast } = useToast();
  const [resent, setResent] = useState(false);

  const resendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/resend-validation", { email });
    },
    onSuccess: () => {
      setResent(true);
      toast({
        title: "Lien renvoyé",
        description: "Un nouveau lien de validation a été envoyé.",
      });
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible de renvoyer le lien. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  const isExpired = reason === "expired";

  return (
    <div className="flex items-center justify-center min-h-[70dvh] p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-secondary p-4">
              {isExpired ? (
                <AlertTriangle className="h-8 w-8 text-primary" />
              ) : (
                <XCircle className="h-8 w-8 text-destructive" />
              )}
            </div>
          </div>
          <CardTitle as="h1" data-testid="text-validation-error-title">
            {isExpired ? "Lien expiré" : "Lien invalide"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isExpired ? (
            <>
              <p className="text-muted-foreground" data-testid="text-validation-error-message">
                Le lien de validation a expiré. Vous pouvez demander l'envoi d'un nouveau lien.
              </p>
              {resent ? (
                <p className="text-sm text-muted-foreground" data-testid="text-resend-success">
                  Un nouveau lien a été envoyé au validateur.
                </p>
              ) : (
                <div className="pt-2">
                  <Button
                    onClick={() => resendMutation.mutate()}
                    disabled={resendMutation.isPending}
                    data-testid="button-resend-validation"
                  >
                    {resendMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : null}
                    Renvoyer le lien
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground" data-testid="text-validation-error-message">
              Ce lien de validation est invalide ou a déjà été utilisé.
            </p>
          )}
          <div className="pt-4">
            <Link href="/login">
              <Button variant="outline" data-testid="link-go-to-login">
                Retour à la connexion
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
