import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useSearch, useLocation, Redirect } from "wouter";
import { ShieldCheck, RefreshCw, Heart } from "lucide-react";
import { validateRegistrationSchema } from "@shared/schema";
import { CONTACT_EMAIL, PLATFORM_NAME } from "@shared/branding";

// Page de confirmation de validation d'inscription.
// Le lien reçu par email pointe sur GET /api/validate qui redirige ici SANS
// consommer le token (protection contre le préchargement par les scanners
// antivirus / proxys de messagerie). La validation réelle n'a lieu que sur
// clic humain, via POST /api/validate.
//
// Inscription d'un senior : le validateur est sa personne de confiance
// (aidant). Il peut créer son espace aidant dans la même étape ; son e-mail
// est celui qui a reçu le lien, fixé par le serveur.

type ValidateInfo = {
  firstName: string;
  role: string;
  aidantEmail: string | null;
  canCreateAidant: boolean;
};

const aidantFormSchema = validateRegistrationSchema.shape.aidant
  .unwrap()
  .extend({ confirmPassword: z.string().min(1, "Confirmation requise") })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

type AidantForm = z.infer<typeof aidantFormSchema>;

export default function Validate() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(searchString).get("token") || "";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // handleSubmit validates asynchronously before confirm() runs: a fast double
  // click could send two POSTs, the second answering "lien invalide".
  const inFlight = useRef(false);

  const infoQuery = useQuery<ValidateInfo, Error & { reason?: string; status?: number }>({
    queryKey: ["/api/validate/info", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/validate/info?token=${encodeURIComponent(token)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.message || "Lien invalide"), { reason: body.reason, status: res.status });
      return body;
    },
  });

  const form = useForm<AidantForm>({
    resolver: zodResolver(aidantFormSchema),
    defaultValues: { firstName: "", lastName: "", password: "", confirmPassword: "" },
  });

  async function confirm(aidant?: Omit<AidantForm, "confirmPassword">) {
    if (!token) {
      navigate("/validation-error?reason=invalid");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aidant ? { token, aidant } : { token }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        navigate(body.aidantCreated ? "/validation-success?aidant=1" : "/validation-success");
        return;
      }
      // Errors about the aidant form stay on the page: the registration
      // itself is still waiting and can be validated.
      if (body.reason === "aidant_exists" || body.reason === "aidant_invalid") {
        setError(body.message || "Impossible de créer l'espace aidant.");
        return;
      }
      navigate(`/validation-error?reason=${body.reason || "invalid"}`);
    } catch {
      navigate("/validation-error?reason=invalid");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (!token) return <Redirect to="/validation-error?reason=invalid" />;

  if (infoQuery.isError) {
    const status = infoQuery.error?.status;
    // Only a dead link goes to the error page; a server or network hiccup
    // must not tell the user their valid link is invalid.
    if (status === 404 || status === 410) {
      return <Redirect to={`/validation-error?reason=${status === 410 ? "expired" : "invalid"}`} />;
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 gap-4 text-center text-lg">
        <p data-testid="text-validate-retry">Un problème temporaire empêche d'afficher cette page.</p>
        <Button onClick={() => infoQuery.refetch()} className="h-12 px-6 text-lg" data-testid="button-validate-retry">
          Réessayer
        </Button>
      </div>
    );
  }

  if (infoQuery.isLoading || !infoQuery.data) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const info = infoQuery.data;
  const isSenior = info.role === "SENIOR";

  // Junior (validated by a teacher): a single confirmation button.
  if (!isSenior) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-secondary p-4">
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle data-testid="text-validate-title">Valider l'inscription de {info.firstName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground" data-testid="text-validate-message">
              Cliquez sur le bouton ci-dessous pour valider ce compte et autoriser son accès à la plateforme{" "}
              {PLATFORM_NAME}.
            </p>
            <Button onClick={() => confirm()} disabled={pending} data-testid="button-confirm-validation">
              {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              Valider le compte
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center p-4 py-10">
      <div className="w-full max-w-xl space-y-6 text-lg">
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold mb-2" data-testid="text-validate-title">
            Valider l'inscription de {info.firstName}
          </h1>
          <p className="text-gray-700" data-testid="text-validate-message">
            {info.firstName} vous a désigné(e) comme personne de confiance, son aidant, sur {PLATFORM_NAME}.
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800" role="alert" data-testid="text-validate-error">
            {error}
          </p>
        )}

        {info.canCreateAidant ? (
          <Card className="border-2 border-[#dc4256]/50" data-testid="card-validate-aidant">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Heart className="h-6 w-6 text-[#dc4256]" />
                Valider et créer mon espace aidant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="list-disc pl-5 text-gray-800 space-y-1">
                <li>Suivre les rencontres de {info.firstName}</li>
                <li>Demander un atelier pour {info.firstName}</li>
                <li>Payer ses forfaits</li>
                <li>Écrire à l'équipe</li>
              </ul>
              <p className="text-gray-800">
                Vous vous connecterez avec l'adresse <strong data-testid="text-aidant-email">{info.aidantEmail}</strong>.
              </p>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(({ confirmPassword: _c, ...aidant }) => confirm(aidant))}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Votre prénom</FormLabel>
                          <FormControl>
                            <Input className="h-12 text-lg" autoComplete="given-name" {...field} data-testid="input-aidant-firstName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Votre nom</FormLabel>
                          <FormControl>
                            <Input className="h-12 text-lg" autoComplete="family-name" {...field} data-testid="input-aidant-lastName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Choisissez un mot de passe (6 caractères minimum)</FormLabel>
                        <FormControl>
                          <Input type="password" className="h-12 text-lg" autoComplete="new-password" {...field} data-testid="input-aidant-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmez le mot de passe</FormLabel>
                        <FormControl>
                          <Input type="password" className="h-12 text-lg" autoComplete="new-password" {...field} data-testid="input-aidant-confirmPassword" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    disabled={pending}
                    className="w-full h-14 text-lg bg-[#dc4256] hover:bg-[#c73848] text-white"
                    data-testid="button-confirm-validation-aidant"
                  >
                    {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                    Valider et créer mon espace aidant
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-gray-800" data-testid="text-aidant-exists">
            Un compte existe déjà avec votre adresse {info.aidantEmail}. Validez l'inscription ci-dessous. Pour relier ce
            compte à {info.firstName}, écrivez à l'équipe : {CONTACT_EMAIL}.
          </p>
        )}

        <div className="text-center space-y-2">
          {info.canCreateAidant && <p className="text-gray-700">Vous ne souhaitez pas d'espace aidant ?</p>}
          <Button
            variant="outline"
            onClick={() => confirm()}
            disabled={pending}
            className="w-full h-auto min-h-12 py-3 px-6 text-lg whitespace-normal"
            data-testid="button-confirm-validation"
          >
            Valider seulement l'inscription de {info.firstName}
          </Button>
        </div>
      </div>
    </div>
  );
}
