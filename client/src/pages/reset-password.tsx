import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { z } from "zod";
import { resetPasswordSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
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
import { CheckCircle2, KeyRound, Lock } from "lucide-react";

// La confirmation n'existe que côté client : le serveur ne reçoit que le
// mot de passe, validé par le même schéma partagé.
const formSchema = z
  .object({
    password: resetPasswordSchema.shape.password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les deux mots de passe ne sont pas identiques",
    path: ["confirmPassword"],
  });

type FormInput = z.infer<typeof formSchema>;

/** Message du serveur dans une erreur apiRequest ("400: {...}"). */
function serverMessage(err: Error | null): string {
  if (!err) return "";
  const sep = err.message.indexOf(": ");
  try {
    return JSON.parse(err.message.slice(sep + 2)).message ?? "";
  } catch {
    return "";
  }
}

export default function ResetPasswordPage() {
  const token = new URLSearchParams(useSearch()).get("token") ?? "";

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormInput) => {
      const res = await apiRequest("POST", "/api/auth/reset-password", {
        token,
        password: data.password,
      });
      return await res.json();
    },
  });

  const errorMessage = mutation.error?.message.startsWith("429")
    ? "Trop de tentatives. Réessayez dans 15 minutes."
    : serverMessage(mutation.error) || "Une erreur est survenue. Réessayez dans quelques instants.";
  const linkInvalid = !token || mutation.error?.message.startsWith("400");

  return (
    <div className="min-h-[70dvh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-md bg-primary/10">
            {mutation.isSuccess ? (
              <CheckCircle2 className="w-6 h-6 text-primary" />
            ) : (
              <KeyRound className="w-6 h-6 text-primary" />
            )}
          </div>
          <CardTitle as="h1" data-testid="text-reset-title">
            {mutation.isSuccess ? "Mot de passe modifié" : "Nouveau mot de passe"}
          </CardTitle>
          {!mutation.isSuccess && token && (
            <CardDescription>Choisissez votre nouveau mot de passe.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {mutation.isSuccess ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground" data-testid="text-reset-success">
                Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
              </p>
              <Link href="/login">
                <Button className="w-full" data-testid="button-go-login">Se connecter</Button>
              </Link>
            </div>
          ) : !token ? (
            <p className="text-sm text-muted-foreground text-center" data-testid="text-reset-no-token">
              Ce lien est incomplet. Ouvrez le lien reçu par e-mail, ou faites une
              nouvelle demande.
            </p>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nouveau mot de passe</FormLabel>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <FormControl>
                          <Input
                            data-testid="input-new-password"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Au moins 6 caractères"
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
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmer le mot de passe</FormLabel>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <FormControl>
                          <Input
                            data-testid="input-confirm-password"
                            type="password"
                            autoComplete="new-password"
                            className="pl-10"
                            {...field}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {mutation.isError && (
                  <p className="text-sm text-destructive" data-testid="text-reset-error">
                    {errorMessage}
                  </p>
                )}

                <Button
                  data-testid="button-reset-password"
                  type="submit"
                  className="w-full"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </form>
            </Form>
          )}

          {!mutation.isSuccess && linkInvalid && (
            <div className="mt-6 text-center text-sm">
              <Link
                href="/mot-de-passe-oublie"
                data-testid="link-new-request"
                className="text-primary font-medium underline underline-offset-4"
              >
                Faire une nouvelle demande
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
