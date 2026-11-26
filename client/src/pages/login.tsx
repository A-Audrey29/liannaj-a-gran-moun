import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TEST_ROLE_LABELS, type TestAccount } from "@shared/test-accounts";
import { useLocation, Link } from "wouter";
import { loginSchema, type LoginInput } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORM_NAME } from "@shared/branding";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { LogIn, Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Demo logins: the server returns an empty list unless Mollie runs with a
  // "test_" key, so nothing shows in production.
  const { data: testAccounts } = useQuery<{ password: string | null; accounts: TestAccount[] }>({
    queryKey: ["/api/test-accounts"],
    staleTime: Infinity,
  });

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginInput) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.setQueryData(["/api/auth/me"], { user: data.user });
      const role = data?.user?.role;
      setLocation(
        role === "ADMIN" ? "/admin" :
        role === "REFERENT_SENIOR" ? "/espace-referent" :
        role === "TEACHER" ? "/espace-professeur" :
        "/mon-espace"
      );
    },
    onError: (error: Error) => {
      const message = error.message || "";
      if (message.includes("429") || message.toLowerCase().includes("trop de tentatives")) {
        toast({
          variant: "destructive",
          title: "Trop de tentatives",
          description: "Vous avez effectué trop de tentatives de connexion. Réessayez dans 15 minutes.",
        });
      } else if (message.includes("403") || message.toLowerCase().includes("attente") || message.toLowerCase().includes("pending")) {
        toast({
          variant: "destructive",
          title: "Compte en attente de validation",
          description: "Votre compte n'a pas encore été validé. Veuillez attendre que votre référent valide votre inscription.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erreur de connexion",
          description: "Email ou mot de passe incorrect.",
        });
      }
    },
  });

  function onSubmit(data: LoginInput) {
    loginMutation.mutate(data);
  }

  return (
    <div className="min-h-[70dvh] flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-md bg-primary/10">
            <LogIn className="w-6 h-6 text-primary" />
          </div>
          <CardTitle as="h1" data-testid="text-login-title">Connexion</CardTitle>
          <CardDescription data-testid="text-login-description">
            Connectez-vous à votre compte {PLATFORM_NAME}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          data-testid="input-email"
                          type="email"
                          placeholder="votre@email.fr"
                          className="pl-10"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mot de passe</FormLabel>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <FormControl>
                        <Input
                          data-testid="input-password"
                          type="password"
                          placeholder="Votre mot de passe"
                          className="pl-10"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="text-right text-sm">
                <Link
                  href="/mot-de-passe-oublie"
                  data-testid="link-forgot-password"
                  className="text-primary underline underline-offset-4"
                >
                  Mot de passe oublié ?
                </Link>
              </div>

              <Button
                data-testid="button-login"
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Connexion en cours..." : "Se connecter"}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <span>Pas encore de compte ? </span>
            <Link
              href="/register"
              data-testid="link-register"
              className="text-primary font-medium underline underline-offset-4"
            >
              Créer un compte
            </Link>
          </div>
        </CardContent>
      </Card>
      {testAccounts && testAccounts.accounts.length > 0 && (
        <div className="w-full max-w-md mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-4" data-testid="section-test-accounts">
          <h2 className="text-base font-semibold text-gray-900 mb-1 text-center">Mode test : comptes de démonstration</h2>
          <p className="text-sm text-gray-700 mb-3 text-center">
            Paiements en mode test (aucun argent réel). Touchez un compte pour remplir le formulaire.
          </p>
          <ul className="flex flex-col gap-2">
            {testAccounts.accounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  className="w-full min-h-11 flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white hover:bg-[#f3eaff] border border-border/50 text-sm transition-colors"
                  onClick={() => {
                    form.setValue("email", account.email);
                    form.setValue("password", testAccounts.password ?? "");
                  }}
                  data-testid={`button-test-${account.email}`}
                >
                  <span className="font-medium">
                    {account.firstName} <span className="font-normal text-gray-600">({TEST_ROLE_LABELS[account.role]})</span>
                  </span>
                  <span className="text-gray-700 text-sm break-all text-right">{account.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
