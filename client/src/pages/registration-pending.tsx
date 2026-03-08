import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Mail } from "lucide-react";

export default function RegistrationPending() {
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
            Votre inscription a bien été enregistrée. Un email a été envoyé à votre référent pour valider votre compte.
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
