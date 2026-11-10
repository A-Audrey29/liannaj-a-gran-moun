import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, PlayCircle, Trash2 } from "lucide-react";
import { queryClient, apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
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
import {
  INACTIVITY_GRACE_DAYS,
  INACTIVITY_THRESHOLD_YEARS,
  type InactiveAccount,
  type InactivityStatus,
} from "@shared/inactivity";

export const INACTIVE_ACCOUNTS_KEY = "/api/admin/inactive-accounts";

const STATUS_LABELS: Record<InactivityStatus, string> = {
  TO_WARN: "À avertir",
  WARNED: "Averti",
  TO_DELETE: "Délai dépassé — à supprimer",
};

const STATUS_COLORS: Record<InactivityStatus, string> = {
  TO_WARN: "bg-gray-100 text-gray-800",
  WARNED: "bg-amber-100 text-amber-800",
  TO_DELETE: "bg-red-100 text-red-800",
};

// Administrative dates (not meeting times): toLocale* is allowed here.
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

export default function InactivityTab({ roleLabel }: { roleLabel: (role: string) => string }) {
  const { toast } = useToast();

  const { data: accounts = [], isLoading, isError } = useQuery<InactiveAccount[]>({
    queryKey: [INACTIVE_ACCOUNTS_KEY],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const runMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", `${INACTIVE_ACCOUNTS_KEY}/run`)).json() as Promise<{ warned: number; failed: number; skipped: boolean }>,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: [INACTIVE_ACCOUNTS_KEY] });
      toast({
        title: r.skipped
          ? "Une vérification est déjà en cours"
          : `${r.warned} e-mail${r.warned > 1 ? "s" : ""} d'avertissement envoyé${r.warned > 1 ? "s" : ""}` +
            (r.failed > 0 ? `, ${r.failed} en échec` : ""),
      });
    },
    onError: (err) => toast({ title: "Vérification impossible", description: apiErrorMessage(err, "Une erreur est survenue"), variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `${INACTIVE_ACCOUNTS_KEY}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [INACTIVE_ACCOUNTS_KEY] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Compte supprimé" });
    },
    onError: (err) => {
      // 409: the account logged in since the list was loaded — refresh it.
      queryClient.invalidateQueries({ queryKey: [INACTIVE_ACCOUNTS_KEY] });
      toast({ title: "Suppression refusée", description: apiErrorMessage(err, "Une erreur est survenue"), variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5" data-testid="tab-content-inactivite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Comptes inactifs</h2>
        <Button
          variant="outline"
          className="min-h-[44px]"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          data-testid="button-run-inactivity"
        >
          {runMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Lancer la vérification
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Comptes sans connexion depuis plus de {INACTIVITY_THRESHOLD_YEARS} ans (administrateurs exclus). Un sénior
        et ses aidants comptent ensemble : la connexion de l'un garde tous les comptes actifs. Un e-mail
        d'avertissement part automatiquement une fois ; sans connexion dans les {INACTIVITY_GRACE_DAYS} jours, le compte
        passe en « à supprimer ». Rien n'est supprimé automatiquement : un admin supprime avec le bouton « Supprimer », qui revérifie
        l'inactivité au moment du clic.
      </p>

      {isError && <p className="text-sm text-primary">Impossible de charger la liste.</p>}

      {!isError && accounts.length === 0 ? (
        <p className="text-muted-foreground text-center py-12" data-testid="text-no-inactive">
          Aucun compte inactif depuis plus de {INACTIVITY_THRESHOLD_YEARS} ans.
        </p>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <Card key={a.id} data-testid={`card-inactive-${a.id}`}>
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <UserAvatar photo={a.profilePhoto} firstName={a.firstName} lastName={a.lastName} className="w-12 h-12" decorative />
                <div className="flex-1 min-w-[12rem]">
                  <p className="font-semibold">{a.firstName} {a.lastName}</p>
                  <p className="text-sm text-muted-foreground">{roleLabel(a.role)}</p>
                  <p className="text-sm text-muted-foreground">
                    Dernière activité : {fmtDate(a.lastActivityAt)}
                    {a.activityVia && (
                      <> (via {roleLabel(a.activityVia.role).toLowerCase()} {a.activityVia.firstName} {a.activityVia.lastName})</>
                    )}
                    {a.warnedAt && <> · Averti le {fmtDate(a.warnedAt)}</>}
                    {a.graceEndsAt && a.status === "WARNED" && <> · Délai jusqu'au {fmtDate(a.graceEndsAt)}</>}
                  </p>
                </div>
                <Badge className={`${STATUS_COLORS[a.status]} text-xs px-2 py-1`} data-testid={`status-inactive-${a.id}`}>
                  {STATUS_LABELS[a.status]}
                </Badge>
                {a.status === "TO_DELETE" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="min-h-[44px] text-red-700 border-red-300 hover:bg-red-50"
                        disabled={deleteMut.isPending}
                        data-testid={`button-delete-inactive-${a.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                        Supprimer
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer {a.firstName} {a.lastName} ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cette action est irréversible. Toutes les données du compte seront supprimées. Si la
                          personne s'est reconnectée entre-temps, la suppression sera refusée.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMut.mutate(a.id)}
                          className="bg-red-600 hover:bg-red-700"
                          data-testid={`button-confirm-delete-inactive-${a.id}`}
                        >
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
