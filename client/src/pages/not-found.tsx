import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70dvh] w-full flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <SearchX className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold" data-testid="text-not-found-title">Page introuvable</h1>
          <p className="mt-2 text-muted-foreground">
            Cette page n'existe pas ou a été déplacée.
          </p>
          <Link href="/">
            <Button className="mt-6 rounded-full" data-testid="link-not-found-home">
              Retour à l'accueil
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
