import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, apiErrorMessage, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PLATFORM_NAME } from "@shared/branding";
import type { CreditBalanceResponse } from "@shared/credits";

/**
 * "Demander la suppression de mon compte": nothing is deleted on the spot. The
 * request goes to the admins (POST /api/account/deletion-request) who check it
 * and act. Unused workshops are lost, so the user confirms first.
 */
export function AccountDeletionRequest() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const isSenior = user?.role === "SENIOR";

  // Only a senior owns workshops (credits): say how many will be lost.
  const { data: credits } = useQuery<CreditBalanceResponse>({
    queryKey: ["/api/credits/balance"],
    enabled: isSenior,
  });
  // The server knows whether a request is still waiting: the button stays
  // "sent" after leaving the tab or reloading.
  const { data: state } = useQuery<{ pending: boolean }>({
    queryKey: ["/api/account/deletion-request"],
    enabled: !!user && user.role !== "ADMIN",
  });
  const sent = state?.pending === true;
  const unused = Math.max(credits?.balance ?? 0, 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/account/deletion-request", { confirmed: true });
      return (await res.json()) as { message: string; alreadyRequested?: boolean };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/account/deletion-request"], { pending: true });
      setOpen(false);
      toast({ title: data.alreadyRequested ? "Demande déjà envoyée" : "Demande envoyée", description: data.message });
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: apiErrorMessage(err, "Impossible d'envoyer la demande. Réessayez."),
      });
    },
  });

  if (!user || user.role === "ADMIN") return null;

  return (
    <section className="mt-6 rounded-2xl border border-destructive/30 p-4" aria-labelledby="titre-suppression-compte" data-testid="section-suppression-compte">
      <h2 id="titre-suppression-compte" className="text-sm font-semibold">Supprimer mon compte</h2>
      <p className="mb-3 mt-1 text-sm text-muted-foreground">
        Vous envoyez une demande à l'équipe {PLATFORM_NAME}, qui supprime votre compte.
      </p>
      <Button
        variant="outline"
        className="w-full rounded-full border-destructive text-destructive"
        disabled={sent}
        onClick={() => setOpen(true)}
        data-testid="button-demande-suppression"
      >
        {sent ? "Demande envoyée à l'équipe" : "Demander la suppression de mon compte"}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-testid="dialog-confirmer-suppression">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer votre compte ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Votre demande est envoyée à l'équipe {PLATFORM_NAME}. Une fois votre compte supprimé, vous ne pourrez
                  plus vous connecter.
                </p>
                {isSenior && (
                  <p className="font-semibold text-foreground" data-testid="text-suppression-credits">
                    {unused > 0
                      ? `Vous avez ${unused} atelier${unused > 1 ? "s" : ""} non utilisé${unused > 1 ? "s" : ""} : ${unused > 1 ? "ils seront perdus" : "il sera perdu"}.`
                      : "Les ateliers non utilisés seront perdus."}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-annuler-suppression">Non, je garde mon compte</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open until the request is accepted.
                e.preventDefault();
                mutation.mutate();
              }}
              disabled={mutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirmer-suppression"
            >
              {mutation.isPending ? "Envoi…" : "Oui, envoyer la demande"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
