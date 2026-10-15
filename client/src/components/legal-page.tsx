import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_NAME } from "@shared/branding";

/**
 * Mise en page commune aux pages légales (mentions, CGU, CGV, confidentialité).
 *
 * Ces pages doivent rester accessibles sans authentification : un visiteur
 * doit pouvoir lire la politique de confidentialité avant de créer un compte.
 */
export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-6 -ml-2" data-testid="link-back-home">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour à l'accueil
          </Button>
        </Link>

        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-legal-title">
          {title}
        </h1>
        {lastUpdated && (
          <p className="mt-2 text-sm text-muted-foreground">
            Dernière mise à jour : {lastUpdated}
          </p>
        )}

        <div className="mt-8 space-y-8">{children}</div>

        <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          {PLATFORM_NAME} — plateforme de mise en relation entre seniors et jeunes
          en Guadeloupe.
        </p>
      </div>
    </div>
  );
}

/** Section d'une page légale. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/**
 * Marque un passage dont le contenu juridique reste à rédiger.
 *
 * Volontairement visible : un texte de remplacement discret finirait par
 * partir en production sans que personne ne le remarque.
 */
export function ARediger({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-amber-500/50 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <span className="font-medium">À compléter — </span>
      {children}
    </p>
  );
}
