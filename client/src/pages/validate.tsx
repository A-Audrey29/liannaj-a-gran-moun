import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSearch, useLocation } from "wouter";
import { ShieldCheck, RefreshCw } from "lucide-react";

// Page de confirmation de validation d'inscription.
// Le lien reçu par email pointe sur GET /api/validate qui redirige ici SANS
// consommer le token (protection contre le préchargement par les scanners
// antivirus / proxys de messagerie). La validation réelle n'a lieu que sur
// clic humain, via POST /api/validate.
export default function Validate() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(searchString).get("token") || "";
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (!token) {
      navigate("/validation-error?reason=invalid");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        navigate("/validation-success");
        return;
      }
      const body = await res.json().catch(() => ({}));
      navigate(`/validation-error?reason=${body.reason || "invalid"}`);
    } catch {
      navigate("/validation-error?reason=invalid");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-secondary p-4">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle data-testid="text-validate-title">Confirmer la validation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground" data-testid="text-validate-message">
            Cliquez sur le bouton ci-dessous pour valider ce compte et autoriser
            son accès à la plateforme FEVES.
          </p>
          <div className="pt-2">
            <Button
              onClick={confirm}
              disabled={pending || !token}
              data-testid="button-confirm-validation"
            >
              {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              Valider le compte
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
