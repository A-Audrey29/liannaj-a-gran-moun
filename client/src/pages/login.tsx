import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { loginSchema, type LoginInput } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-md bg-primary/10">
            <LogIn className="w-6 h-6 text-primary" />
          </div>
          <CardTitle data-testid="text-login-title">Connexion</CardTitle>
          <CardDescription data-testid="text-login-description">
            Connectez-vous à votre compte FEVES
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
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          data-testid="input-email"
                          type="email"
                          placeholder="votre@email.fr"
                          className="pl-10"
                          {...field}
                        />
                      </div>
                    </FormControl>
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
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          data-testid="input-password"
                          type="password"
                          placeholder="Votre mot de passe"
                          className="pl-10"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
      <div className="w-full max-w-md mt-4 rounded-2xl bg-muted/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">Comptes de test</p>
        <div className="flex flex-col gap-2">
          {[
            { label: "Admin", email: "admin@feves.fr" },
            { label: "Senior", email: "senior@test.fr" },
            { label: "Jeune", email: "junior@test.fr" },
            { label: "Référent", email: "referent@test.fr" },
            { label: "Professeur", email: "professeur@test.fr" },
          ].map((account) => (
            <button
              key={account.email}
              type="button"
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-white hover:bg-[#f3eaff] border border-border/50 text-sm transition-colors"
              onClick={() => {
                form.setValue("email", account.email);
                form.setValue("password", "password");
              }}
              data-testid={`button-test-${account.label.toLowerCase()}`}
            >
              <span className="font-medium">{account.label}</span>
              <span className="text-muted-foreground text-xs">{account.email}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
