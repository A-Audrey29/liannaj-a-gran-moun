import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest, apiErrorMessage, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isMeetingEnded, AUTO_COMPLETE_HOURS } from "@shared/meeting-check";

type Meeting = { id: string; status: string; scheduledDate: Date | string; durationMinutes: number };

/**
 * Senior or aidant: "la rencontre a eu lieu", once it has ended and was
 * confirmed by the junior. Without it, the meeting closes itself
 * AUTO_COMPLETE_HOURS after its end (décision du 2026-11-10). Renders nothing
 * otherwise; the server checks the same rules.
 */
export function MeetingDoneButton({ meeting }: { meeting: Meeting }) {
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/interventions/${meeting.id}/done`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meetings/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/referent/relations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/history"] });
      toast({ title: "Merci ! La rencontre est enregistrée.", description: "Le senior et le jeune sont invités à donner leur avis." });
    },
    onError: (err) => toast({ title: "Impossible d'enregistrer", description: apiErrorMessage(err, "Réessayez plus tard."), variant: "destructive" }),
  });

  if (meeting.status !== "CONFIRMED" || !isMeetingEnded(meeting, new Date())) return null;

  return (
    <div className="space-y-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            className="w-full min-h-11 bg-primary hover:bg-primary/90 text-white"
            disabled={mutation.isPending}
            data-testid={`button-meeting-done-${meeting.id}`}
          >
            <Check className="w-4 h-4 mr-1.5" />
            La rencontre a eu lieu
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>La rencontre a bien eu lieu ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'atelier sera décompté de vos crédits (sauf s'il s'agit de la première rencontre offerte).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()} data-testid={`button-meeting-done-confirm-${meeting.id}`}>
              Oui, elle a eu lieu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <p className="text-xs text-muted-foreground">
        Sans réponse, elle sera considérée comme réalisée {AUTO_COMPLETE_HOURS} h après la fin. Elle n'a pas eu lieu ?
        Prévenez l'équipe.
      </p>
    </div>
  );
}
