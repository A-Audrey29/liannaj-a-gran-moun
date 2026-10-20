import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useSearch } from "wouter";
import { CheckCircle } from "lucide-react";

export default function ValidationSuccess() {
  // ?aidant=1: the trusted person also opened their aidant space (validate.tsx).
  const aidantCreated = new URLSearchParams(useSearch()).get("aidant") === "1";

  return (
    <div className="flex items-center justify-center min-h-[70dvh] p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-secondary p-4">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle as="h1" data-testid="text-validation-success-title">
            {aidantCreated ? "Inscription validée, espace aidant créé" : "Inscription validée"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground" data-testid="text-validation-success-message">
            {aidantCreated
              ? "Vous pouvez vous connecter à votre espace aidant avec votre adresse e-mail et le mot de passe que vous venez de choisir."
              : "Merci ! La personne inscrite peut maintenant se connecter avec son adresse e-mail et son mot de passe."}
          </p>
          <div className="pt-4">
            <Link href="/login">
              <Button data-testid="link-go-to-login">
                {aidantCreated ? "Me connecter" : "Aller à la page de connexion"}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
