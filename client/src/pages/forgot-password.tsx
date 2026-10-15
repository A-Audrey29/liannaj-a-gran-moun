import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@shared/schema";
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
import { KeyRound, Mail, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: ForgotPasswordInput) => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", data);
      return (await res.json()) as { message: string };
    },
  });

  const tooManyRequests = mutation.error?.message.startsWith("429");

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-md bg-primary/10">
            {mutation.isSuccess ? (
              <MailCheck className="w-6 h-6 text-primary" />
            ) : (
              <KeyRound className="w-6 h-6 text-primary" />
            )}
          </div>
          <CardTitle data-testid="text-forgot-title">Mot de passe oublié</CardTitle>
          <CardDescription>
            {mutation.isSuccess
              ? "Vérifiez votre boîte e-mail."
              : "Indiquez l'adresse e-mail de votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mutation.isSuccess ? (
            <div className="space-y-4 text-sm text-muted-foreground" data-testid="text-forgot-sent">
              <p>{mutation.data.message}</p>
              <p>
                Le lien est valable 1 heure. Pensez à regarder dans vos courriers
                indésirables si vous ne le voyez pas.
              </p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
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
                            autoComplete="email"
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

                {mutation.isError && (
                  <p className="text-sm text-destructive" data-testid="text-forgot-error">
                    {tooManyRequests
                      ? "Trop de demandes. Réessayez dans 15 minutes."
                      : "Une erreur est survenue. Réessayez dans quelques instants."}
                  </p>
                )}

                <Button
                  data-testid="button-send-reset-link"
                  type="submit"
                  className="w-full"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? "Envoi en cours..." : "Recevoir le lien"}
                </Button>
              </form>
            </Form>
          )}

          <div className="mt-6 text-center text-sm">
            <Link
              href="/login"
              data-testid="link-back-login"
              className="text-primary font-medium underline underline-offset-4"
            >
              Retour à la connexion
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
