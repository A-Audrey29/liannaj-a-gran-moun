import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useSearch } from "wouter";
import { CONTACT_EMAIL } from "@shared/branding";
import { Mail } from "lucide-react";

export default function RegistrationPending() {
  // ?email=echec: the account exists but the validation e-mail failed (register route).
  const emailFailed = new URLSearchParams(useSearch()).get("email") === "echec";

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-secondary p-4">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle data-testid="text-pending-title">Inscription en cours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground" data-testid="text-pending-message">
            {emailFailed ? (
              <>
                Votre inscription a bien été enregistrée, mais l'e-mail de validation n'a pas pu être envoyé. Écrivez à
                l'équipe : <strong>{CONTACT_EMAIL}</strong>. Inutile de vous réinscrire.
              </>
            ) : (
              "Votre inscription a bien été enregistrée. Un e-mail a été envoyé à la personne qui doit la valider (votre personne de confiance, ou votre référent scolaire)."
            )}
          </p>
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
