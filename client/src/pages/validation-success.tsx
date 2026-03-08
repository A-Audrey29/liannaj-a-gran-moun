import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CheckCircle } from "lucide-react";

export default function ValidationSuccess() {
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-secondary p-4">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle data-testid="text-validation-success-title">Compte validé</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground" data-testid="text-validation-success-message">
            Votre compte a été validé avec succès. Vous pouvez maintenant vous connecter.
          </p>
          <div className="pt-4">
            <Link href="/login">
              <Button data-testid="link-go-to-login">
                Se connecter
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
