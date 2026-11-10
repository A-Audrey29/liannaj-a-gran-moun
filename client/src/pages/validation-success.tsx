import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useSearch } from "wouter";
import { CheckCircle } from "lucide-react";

// Outcome of /validate (validate.tsx):
// ?aidant=1          the trusted person also opened their aidant space
// ?teacher=created   the teacher opened their space, the student is in it
// ?teacher=linked    the student joined the teacher's existing space
// ?refused=1         the teacher refused the registration
function outcome(params: URLSearchParams): { title: string; message: string; login: string | null } {
  if (params.get("refused") === "1") {
    return {
      title: "Inscription refusée",
      message: "Merci. Le compte n'est pas ouvert ; la personne est prévenue par e-mail et l'équipe peut corriger en cas d'erreur.",
      login: null,
    };
  }
  if (params.get("aidant") === "1") {
    return {
      title: "Inscription validée, espace aidant créé",
      message: "Vous pouvez vous connecter à votre espace aidant avec votre adresse e-mail et le mot de passe que vous venez de choisir.",
      login: "Me connecter",
    };
  }
  if (params.get("teacher") === "created") {
    return {
      title: "Inscription validée, espace professeur créé",
      message: "Votre élève est déjà dans votre espace professeur. Connectez-vous avec votre adresse e-mail et le mot de passe que vous venez de choisir.",
      login: "Me connecter",
    };
  }
  if (params.get("teacher") === "linked") {
    return {
      title: "Inscription validée",
      message: "Votre élève a rejoint votre espace professeur. Il ou elle peut maintenant se connecter.",
      login: "Me connecter",
    };
  }
  return {
    title: "Inscription validée",
    message: "Merci ! La personne inscrite peut maintenant se connecter avec son adresse e-mail et son mot de passe.",
    login: "Aller à la page de connexion",
  };
}

export default function ValidationSuccess() {
  const { title, message, login } = outcome(new URLSearchParams(useSearch()));

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
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground" data-testid="text-validation-success-message">
            {message}
          </p>
          {login && (
            <div className="pt-4">
              <Link href="/login">
                <Button data-testid="link-go-to-login">{login}</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
