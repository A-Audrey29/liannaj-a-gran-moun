import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { getPhotoUrl } from "@/lib/photo-url";
import type { Relation, User as UserType, Intervention } from "@shared/schema";
import AvailabilityWeekPicker, { type FreeSlot } from "@/components/availability-week-picker";
import { fmtTime, fmtTimeRange, fmtDayLong } from "@/lib/availability-format";

type RelationDetail = Relation & { senior: UserType; junior: UserType; interventions: Intervention[] };

function ParticipantCard({ user: u, label }: { user: UserType; label: string }) {
  const photoSrc = getPhotoUrl(u.profilePhoto);
  return (
    <div className="flex items-start gap-3 bg-muted/40 rounded-xl p-4 border">
      <div className="shrink-0">
        {photoSrc ? (
          <img src={photoSrc} alt={u.firstName} className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-[#e8d7fe] flex items-center justify-center text-lg font-bold text-[#8b5cf6]">
            {u.firstName[0]}{u.lastName[0]}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
        <div className="font-semibold text-sm">{u.firstName} {u.lastName}</div>
        {u.city && <div className="text-xs text-muted-foreground">{u.city}</div>}
        {u.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{u.bio}</p>}
        {u.desiredActivity && <p className="text-xs text-muted-foreground mt-1 italic">"{u.desiredActivity}"</p>}
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
  const partner = relation.seniorId === user?.id ? relation.junior : relation.senior;
  const isSenior = relation.seniorId === user?.id;
  const isJunior = relation.juniorId === user?.id;
  const canPropose = isSenior && relation.status === "ACTIVE";
  const canProposeFirst = isAdmin && relation.status === "PENDING_FIRST_MEETING";
  const canAdvance = isAdmin && relation.status === "PENDING";
  const sortedInterventions = [...relation.interventions].sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button onClick={() => setLocation(user?.role === "ADMIN" ? "/admin" : "/mon-espace")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors" data-testid="button-back">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

      {isAdmin ? (
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
              <div className="w-14 h-14 rounded-full bg-[#e8d7fe] flex items-center justify-center text-lg font-bold text-[#8b5cf6]">
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
                className="mt-4 rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white"
                onClick={() => setLocation(`/mon-espace?tab=messages&relation=${relation.id}`)}
                data-testid="button-send-message-detail"
              >
                <Mail className="w-4 h-4 mr-2" /> Envoyer un message à {partner.firstName}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {(isSenior || isAdmin) && (
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
          slot={pickedSlot}
          onClose={() => setPickedSlot(null)}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Interventions</h3>
      </div>

      {sortedInterventions.length === 0 ? (
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            {relation.status === "PENDING_FIRST_MEETING"
              ? "Un administrateur va organiser votre premiere rencontre."
              : "Aucune intervention pour le moment."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedInterventions.map((interv) => (
            <InterventionCard key={interv.id} intervention={interv} relation={relation} user={user} />
          ))}
        </div>
      )}

      {relation.status !== "CLOSED" && (
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
                <AlertDialogAction onClick={() => closeMutation.mutate()} className="bg-[#dc4256] hover:bg-[#c73848]">Confirmer</AlertDialogAction>
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
      toast({ title: "Intervention confirmee !" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/interventions/${intervention.id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations", relation.id] });
      toast({ title: "Intervention annulee." });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const hasSeniorFeedback = intervention.seniorRating !== null;
  const hasJuniorFeedback = intervention.juniorRating !== null;
  const needsMyFeedback = intervention.status === "COMPLETED_PENDING_FEEDBACK" && ((isSenior && !hasSeniorFeedback) || (isJunior && !hasJuniorFeedback));

  return (
    <Card className="rounded-2xl border-0 shadow-sm" data-testid={`card-intervention-${intervention.id}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              {new Date(intervention.scheduledDate).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="w-4 h-4" />
              {intervention.durationMinutes} min
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
              <Badge key={i} variant="outline" className="text-[10px] bg-[#f3eaff] px-1.5 py-0">{t}</Badge>
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

        {intervention.status === "COMPLETED" && (
          <div className="mt-3 space-y-2 pt-3 border-t border-border/50">
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
  slot,
  onClose,
}: {
  relationId: string;
  isFirst: boolean;
  slot: FreeSlot | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("120");
  const [location, setLocation] = useState("");
  const [tasks, setTasks] = useState("");

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
      setDuration(String(Math.min(120, Math.min(slotMinutes, 480))));
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
      await apiRequest("POST", `/api/relations/${relationId}/interventions`, {
        // Instant UTC : sans ambiguïté quel que soit le fuseau du serveur.
        scheduledDate: chosenStart!.toISOString(),
        durationMinutes: parseInt(duration),
        location: location || undefined,
        tasks: tasks ? tasks.split(",").map((t) => t.trim()).filter(Boolean) : [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations", relationId] });
      queryClient.invalidateQueries({ queryKey: [`/api/users`] });
      toast({ title: isFirst ? "1ère rencontre proposée !" : "Rencontre proposée !" });
      setDuration("120");
      setLocation("");
      setTasks("");
      onClose();
    },
    onError: (err: any) =>
      toast({
        title: "Proposition refusée",
        description: err?.message || "Ce créneau n'est pas disponible.",
        variant: "destructive",
      }),
  });

  const durationNum = parseInt(duration) || 0;
  const tooLong = durationNum > maxDuration;
  const tooShort = durationNum < 30;

  return (
    <Dialog open={slot !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isFirst ? "Organiser la 1ère rencontre" : "Proposer une rencontre"}</DialogTitle>
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
              <Label>Activités (séparées par des virgules)</Label>
              <Input
                value={tasks}
                onChange={(e) => setTasks(e.target.value)}
                placeholder="Ex: Cuisine, Jardinage"
                data-testid="input-intervention-tasks"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || tooLong || tooShort}
            className="bg-[#dc4256] hover:bg-[#c73848] text-white"
            data-testid="button-submit-intervention"
          >
            {createMutation.isPending ? "Envoi..." : "Proposer"}
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
        <Button size="sm" className="rounded-full bg-orange-500 hover:bg-orange-600 text-white text-xs mt-2" data-testid={`button-feedback-${interventionId}`}>
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
          <Button onClick={() => feedbackMutation.mutate()} disabled={feedbackMutation.isPending || rating === 0} className="bg-[#dc4256] hover:bg-[#c73848] text-white" data-testid="button-submit-feedback">
            {feedbackMutation.isPending ? "Envoi..." : "Envoyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
