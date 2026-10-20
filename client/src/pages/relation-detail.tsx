import { useAuth } from "@/hooks/use-auth";
import { UserAvatar } from "@/components/user-avatar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, apiErrorCode, apiErrorMessage, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation, useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import StatusBadge from "@/components/status-badge";
import StarRating from "@/components/star-rating";
import { ArrowLeft, Calendar, Clock, MapPin, Check, X, Mail, CheckCheck } from "lucide-react";
import { useState, useEffect } from "react";
import type { Relation, User as UserType, Intervention } from "@shared/schema";
import AvailabilityWeekPicker, { type FreeSlot } from "@/components/availability-week-picker";
import { fmtTime, fmtTimeRange, fmtDayLong, fmtDayShort } from "@/lib/availability-format";
import { ATELIERS } from "@shared/ateliers";
import { insufficientCreditsNotice, FREE_FIRST_MEETING_MAX_MINUTES, defaultDurationMinutes } from "@shared/credits";

type RelationDetail = Relation & { senior: UserType; junior: UserType; interventions: Intervention[] };

function ParticipantCard({ user: u, label }: { user: UserType; label: string }) {
  return (
    <div className="flex items-start gap-3 bg-muted/40 rounded-xl p-4 border">
      <div className="shrink-0">
        <UserAvatar photo={u.profilePhoto} firstName={u.firstName} lastName={u.lastName} className="w-14 h-14" fallbackClassName="text-lg" decorative />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
        <div className="font-semibold text-sm">{u.firstName} {u.lastName}</div>
        {u.city && <div className="text-xs text-muted-foreground">{u.city}</div>}
        {u.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{u.bio}</p>}
      </div>
    </div>
  );
}

function AdvanceButton({ relationId, seniorName, juniorName }: { relationId: string; seniorName: string; juniorName: string }) {
  const { toast } = useToast();
  const advanceMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/relations/${relationId}/advance`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations", relationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/relations"] });
      toast({ title: "Relation avancée", description: "La relation est maintenant en attente de cadrage." });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-advance-relation">
          <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Valider l'accord du jeune
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Valider l'accord du jeune ?</AlertDialogTitle>
          <AlertDialogDescription>
            Vous confirmez que <strong>{juniorName}</strong> a accepté la demande de <strong>{seniorName}</strong> (accord verbal, téléphone, en personne). La relation passera en phase de cadrage pour organiser la 1ère rencontre.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={() => advanceMut.mutate()} className="bg-emerald-600 hover:bg-emerald-700" disabled={advanceMut.isPending}>
            Confirmer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function RelationDetail() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [pickedSlot, setPickedSlot] = useState<FreeSlot | null>(null);

  const { data: relation, isLoading } = useQuery<RelationDetail>({
    queryKey: ["/api/relations", params.id],
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/relations/${params.id}/close`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/relations"] });
      toast({ title: "Relation fermee." });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-32 rounded-2xl mb-4" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (!relation) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">Relation non trouvee.</p>
        <Link href="/">
          <Button variant="outline" className="mt-4">Retour</Button>
        </Link>
      </div>
    );
  }

  const isAdmin = user?.role === "ADMIN";
  const isSenior = relation.seniorId === user?.id;
  const isJunior = relation.juniorId === user?.id;
  // Le référent n'est ni le sénior ni le jeune de la relation : il agit au nom
  // du sénior auquel il est rattaché (linkedSeniorId), vérifié côté serveur.
  const isReferent = user?.role === "REFERENT_SENIOR" && (user as any).linkedSeniorId === relation.seniorId;
  const partner = isSenior ? relation.junior : relation.senior;
  const canPropose = (isSenior || isReferent) && relation.status === "ACTIVE";
  const canProposeFirst = isAdmin && relation.status === "PENDING_FIRST_MEETING";
  const canAdvance = isAdmin && relation.status === "PENDING";
  const sortedInterventions = [...relation.interventions].sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button onClick={() => setLocation(user?.role === "ADMIN" ? "/admin" : "/mon-espace")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors" data-testid="button-back">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

      {isAdmin || isReferent ? (
        <Card className="rounded-2xl border-0 shadow-sm mb-6">
          <CardContent className="py-6">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statut relation :</span>
                <StatusBadge status={relation.status} />
              </div>
              {canAdvance && <AdvanceButton relationId={relation.id} seniorName={relation.senior.firstName} juniorName={relation.junior.firstName} />}
            </div>
            {canAdvance && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                Le jeune n'a pas encore accepté via l'application. Si l'accord a été obtenu autrement (téléphone, en personne), vous pouvez valider manuellement.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ParticipantCard user={relation.senior} label="Sénior" />
              <ParticipantCard user={relation.junior} label="Jeune" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-0 shadow-sm mb-6">
          <CardContent className="py-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-[#e8d7fe] flex items-center justify-center text-lg font-bold text-[#6d28d9]">
                {partner.firstName[0]}{partner.lastName[0]}
              </div>
              <div>
                <h2 className="text-lg font-bold">{partner.firstName} {partner.lastName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={partner.role} />
                  <span className="text-xs text-muted-foreground">{partner.city || ""}</span>
                </div>
              </div>
            </div>
            {partner.bio && <p className="text-sm text-muted-foreground mb-3">{partner.bio}</p>}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Statut relation :</span>
              <StatusBadge status={relation.status} />
            </div>
            {relation.status === "ACTIVE" && (isSenior || isJunior) && (
              <Button
                className="mt-4 rounded-full bg-primary hover:bg-primary/90 text-white"
                onClick={() => setLocation(`/mon-espace?tab=messages&relation=${relation.id}`)}
                data-testid="button-send-message-detail"
              >
                <Mail className="w-4 h-4 mr-2" /> Envoyer un message à {partner.firstName}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {relation.status === "PENDING_FIRST_MEETING" && (isSenior || isJunior) && (
        <div
          className="rounded-2xl bg-[#f3eaff] px-5 py-4 mb-6 text-sm"
          data-testid="text-first-meeting-info"
        >
          <p className="font-semibold text-base mb-1">Votre première rencontre</p>
          {sortedInterventions.some((i) => i.status === "PROPOSED" || i.status === "CONFIRMED")
            ? "Elle est prévue : le jour, l'heure et le lieu sont indiqués plus bas."
            : "L'équipe Lyannaj l'organise pour vous et vous contacte pour fixer le jour. Vous n'avez rien à faire."}
        </div>
      )}

      {/* The week picker is shown only where a slot can be picked: a senior
          waiting for the first meeting saw green slots that did nothing. */}
      {(canPropose || canProposeFirst || isAdmin || isReferent) && (
        <AvailabilityWeekPicker
          juniorId={relation.juniorId}
          juniorName={relation.junior.firstName}
          interventions={relation.interventions}
          onPickSlot={canPropose || canProposeFirst ? setPickedSlot : null}
        />
      )}

      {(canPropose || canProposeFirst) && (
        <NewInterventionDialog
          relationId={relation.id}
          isFirst={canProposeFirst}
          asReferent={isReferent}
          slot={pickedSlot}
          onClose={() => setPickedSlot(null)}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rencontres</h3>
      </div>

      {sortedInterventions.length === 0 ? (
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            {relation.status !== "PENDING_FIRST_MEETING"
              ? "Aucune rencontre pour le moment."
              : isAdmin
              ? `Cliquez sur un créneau de ${relation.junior.firstName} ci-dessus pour organiser la première rencontre.`
              : "L'équipe Lyannaj va vous contacter pour organiser votre première rencontre."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedInterventions.map((interv) => (
            <InterventionCard key={interv.id} intervention={interv} relation={relation} user={user} />
          ))}
        </div>
      )}

      {relation.status !== "CLOSED" && (isSenior || isJunior || isAdmin) && (
        <div className="mt-8 text-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="rounded-full text-xs text-muted-foreground" data-testid="button-close-relation">
                Fermer la relation
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Fermer cette relation ?</AlertDialogTitle>
                <AlertDialogDescription>Cette action est irreversible. Vous ne pourrez plus echanger avec {partner.firstName}.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => closeMutation.mutate()} className="bg-primary hover:bg-primary/90">Confirmer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function InterventionCard({ intervention, relation, user }: { intervention: Intervention; relation: RelationDetail; user: any }) {
  const { toast } = useToast();
  const isJunior = relation.juniorId === user?.id;
  const isSenior = relation.seniorId === user?.id;

  const confirmMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/interventions/${intervention.id}/confirm`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations", relation.id] });
      toast({ title: "Rencontre confirmée !" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/interventions/${intervention.id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations", relation.id] });
      toast({ title: "Rencontre annulée." });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const hasSeniorFeedback = intervention.seniorRating !== null;
  const hasJuniorFeedback = intervention.juniorRating !== null;
  const needsMyFeedback = intervention.status === "COMPLETED_PENDING_FEEDBACK" && ((isSenior && !hasSeniorFeedback) || (isJunior && !hasJuniorFeedback));

  return (
    <Card className="rounded-2xl border-0 shadow-sm" data-testid={`card-intervention-${intervention.id}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {fmtDayShort(new Date(intervention.scheduledDate))}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-4 h-4" />
              {fmtTime(new Date(intervention.scheduledDate))} · {intervention.durationMinutes} min
            </div>
            {intervention.location && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                {intervention.location}
              </div>
            )}
          </div>
          <StatusBadge status={intervention.status} />
        </div>

        {intervention.tasks.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-3">
            {intervention.tasks.map((t, i) => (
              <Badge key={i} variant="outline" className="text-xs bg-[#f3eaff] px-1.5 py-0">{t}</Badge>
            ))}
          </div>
        )}

        {intervention.status === "PROPOSED" && isJunior && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending} data-testid={`button-confirm-${intervention.id}`}>
              <Check className="w-3 h-3 mr-1" /> Confirmer
            </Button>
            <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              <X className="w-3 h-3 mr-1" /> Refuser
            </Button>
          </div>
        )}

        {needsMyFeedback && <FeedbackDialog interventionId={intervention.id} relationId={relation.id} />}

        {/*
          Le serveur ne renvoie que le feedback que l'utilisateur a le droit de
          lire : jeune et sénior ne voient que le leur. Les blocs absents ne
          signifient donc pas « pas encore répondu ».
        */}
        {intervention.status === "COMPLETED" && (hasSeniorFeedback || hasJuniorFeedback) && (
          <div className="mt-3 space-y-2 pt-3 border-t border-border/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {isSenior || isJunior ? "Votre feedback" : "Feedbacks"}
            </p>
            {hasSeniorFeedback && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground text-xs w-12">Senior</span>
                <StarRating value={intervention.seniorRating!} readonly size={16} />
                {intervention.seniorComment && <span className="text-xs text-muted-foreground italic">"{intervention.seniorComment}"</span>}
              </div>
            )}
            {hasJuniorFeedback && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground text-xs w-12">Jeune</span>
                <StarRating value={intervention.juniorRating!} readonly size={16} />
                {intervention.juniorComment && <span className="text-xs text-muted-foreground italic">"{intervention.juniorComment}"</span>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


/**
 * Génère les heures de départ possibles dans un créneau, pas de 15 min,
 * en laissant au moins 30 min (durée mini serveur) avant la fin.
 */
function startTimeOptions(slot: FreeSlot): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  let cursor = new Date(slot.startAt);
  const latest = new Date(slot.endAt.getTime() - 30 * 60_000);
  while (cursor <= latest) {
    options.push({ value: cursor.toISOString(), label: fmtTime(cursor) });
    cursor = new Date(cursor.getTime() + 15 * 60_000);
  }
  return options;
}

/**
 * Proposition de rencontre, pilotée par le créneau cliqué dans la grille.
 *
 * Il n'y a volontairement pas de saisie libre de date : le serveur refuse tout
 * créneau hors disponibilités, donc laisser saisir n'importe quoi ne produirait
 * que des 400. L'heure de départ et la durée restent ajustables dans les
 * bornes du créneau.
 */
function NewInterventionDialog({
  relationId,
  isFirst,
  asReferent,
  slot,
  onClose,
}: {
  relationId: string;
  isFirst: boolean;
  asReferent: boolean;
  slot: FreeSlot | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(String(defaultDurationMinutes(isFirst)));
  const [location, setLocation] = useState("");
  const [tasks, setTasks] = useState<string[]>([]);

  function toggleTask(task: string) {
    setTasks((prev) => prev.includes(task) ? prev.filter((t) => t !== task) : [...prev, task]);
  }

  const startOptions = slot ? startTimeOptions(slot) : [];
  const chosenStart = startTime ? new Date(startTime) : slot?.startAt || null;

  const remainingMinutes = chosenStart && slot
    ? Math.floor((slot.endAt.getTime() - chosenStart.getTime()) / 60_000)
    : 0;
  // Bornes serveur : min 30, max 480 (insertInterventionSchema).
  const maxDuration = Math.min(remainingMinutes, 480);

  // À chaque nouveau créneau, repartir du début du créneau et d'une durée qui tient dedans.
  useEffect(() => {
    if (slot) {
      const slotMinutes = Math.floor((slot.endAt.getTime() - slot.startAt.getTime()) / 60_000);
      setStartTime(slot.startAt.toISOString());
      // First meeting: default to the free duration, a longer one costs a credit.
      setDuration(String(defaultDurationMinutes(isFirst, slotMinutes)));
    }
  }, [slot]);

  // Si l'heure choisie réduit la durée max en dessous de la durée saisie, la recadrer.
  useEffect(() => {
    if (duration && parseInt(duration) > maxDuration && maxDuration >= 30) {
      setDuration(String(maxDuration));
    }
  }, [maxDuration]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        scheduledDate: chosenStart!.toISOString(),
        durationMinutes: parseInt(duration),
        location: location || undefined,
        tasks,
      };
      if (asReferent) {
        await apiRequest("POST", "/api/referent/interventions", { ...payload, relationId });
      } else {
        await apiRequest("POST", `/api/relations/${relationId}/interventions`, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations", relationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/referent/relations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users`] });
      toast({ title: isFirst ? "1ère rencontre proposée !" : "Atelier demandé !" });
      setDuration(String(defaultDurationMinutes(isFirst)));
      setLocation("");
      setTasks([]);
      onClose();
    },
    onError: (err) => {
      if (apiErrorCode(err) === "INSUFFICIENT_CREDITS") {
        // Role-aware wording; "buy" only for who can buy (shared/credits.ts).
        const notice = insufficientCreditsNotice(user);
        toast({
          title: notice.title,
          description: notice.message,
          variant: "destructive",
          action: notice.canBuy ? (
            <ToastAction
              altText="Acheter des ateliers"
              onClick={() => navigate("/mes-ateliers")}
              data-testid="button-toast-buy-ateliers"
            >
              Acheter des ateliers
            </ToastAction>
          ) : undefined,
        });
        return;
      }
      toast({
        title: "Demande refusée",
        description: apiErrorMessage(err, "Ce créneau n'est pas disponible."),
        variant: "destructive",
      });
    },
  });

  const durationNum = parseInt(duration) || 0;
  const tooLong = durationNum > maxDuration;
  const tooShort = durationNum < 30;

  return (
    <Dialog open={slot !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isFirst ? "Organiser la 1ère rencontre" : "Demander un atelier"}</DialogTitle>
        </DialogHeader>
        {slot && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-0.5">
                Créneau choisi
              </div>
              <div className="text-sm font-semibold text-emerald-900" data-testid="text-picked-slot">
                {fmtDayLong(slot.startAt)} · {fmtTimeRange(slot.startAt, slot.endAt)}
              </div>
            </div>
            <div>
              <Label>Heure de début</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger data-testid="select-intervention-start-time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {startOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Durée (minutes)</Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                min="30"
                max={maxDuration}
                step="15"
                data-testid="input-intervention-duration"
              />
              <p className={`text-xs mt-1 ${tooLong || tooShort ? "text-destructive" : "text-muted-foreground"}`}>
                {tooShort
                  ? "Minimum 30 minutes."
                  : tooLong
                  ? `Ce créneau ne dure que ${maxDuration} minutes.`
                  : `Jusqu'à ${maxDuration} minutes disponibles.`}
              </p>
              {isFirst && (
                <p className="text-xs text-muted-foreground mt-1" data-testid="text-free-first-meeting">
                  Offerte jusqu'à {FREE_FIRST_MEETING_MAX_MINUTES} minutes. Au-delà, elle utilise un atelier du senior.
                </p>
              )}
            </div>
            <div>
              <Label>Lieu</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: Centre social, domicile..."
                data-testid="input-intervention-location"
              />
            </div>
            <div>
              <Label>Prestation</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {ATELIERS.map((task) => {
                  const selected = tasks.includes(task);
                  return (
                    <button
                      key={task}
                      type="button"
                      onClick={() => toggleTask(task)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        selected
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-muted-foreground border-border hover:bg-muted"
                      }`}
                      data-testid={`task-${task}`}
                    >
                      {task}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || tooLong || tooShort}
            className="bg-primary hover:bg-primary/90 text-white"
            data-testid="button-submit-intervention"
          >
            {createMutation.isPending ? "Envoi..." : isFirst ? "Proposer" : "Demander l'atelier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeedbackDialog({ interventionId, relationId }: { interventionId: string; relationId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/interventions/${interventionId}/feedback`, { rating, comment: comment || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations", relationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/interventions/pending-feedback"] });
      toast({ title: "Merci pour votre feedback !" });
      setOpen(false);
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full bg-orange-700 hover:bg-orange-800 text-white text-xs mt-2" data-testid={`button-feedback-${interventionId}`}>
          Donner mon feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Votre feedback</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Note</Label>
            <StarRating value={rating} onChange={setRating} size={32} />
          </div>
          <div>
            <Label>Commentaire (optionnel)</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Partagez votre experience..." rows={3} data-testid="input-feedback-comment" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => feedbackMutation.mutate()} disabled={feedbackMutation.isPending || rating === 0} className="bg-primary hover:bg-primary/90 text-white" data-testid="button-submit-feedback">
            {feedbackMutation.isPending ? "Envoi..." : "Envoyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
