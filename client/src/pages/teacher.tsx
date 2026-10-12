import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getPhotoUrl } from "@/lib/photo-url";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MobileTabsMenu } from "@/components/mobile-tabs-menu";
import MeetingHistory from "@/components/meeting-history";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  User,
  MessageSquare,
  Users,
  Calendar,
  Star,
  Pencil,
  Trash2,
  Plus,
  GraduationCap,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { User as UserType } from "@shared/schema";
import { fmtTime, fmtDayLongMonthYear } from "@/lib/availability-format";
import { isUpcomingOrOngoing } from "@shared/meeting-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type StudentSummary = UserType & { linkedAt: string };

type InterventionItem = {
  id: string;
  scheduledDate: string;
  durationMinutes: number;
  location: string | null;
  tasks: string[];
  status: string;
  seniorRating: number | null;
  seniorComment: string | null;
  juniorRating: number | null;
  juniorComment: string | null;
};

type RelationItem = {
  id: string;
  status: string;
  createdAt: string;
  senior: UserType;
  interventions: InterventionItem[];
};

type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  teacherName: string;
  isOwn: boolean;
};

type StudentDetail = {
  student: UserType;
  relations: RelationItem[];
  comments: CommentItem[];
};

// ── Labels / couleurs ─────────────────────────────────────────────────────────

const RELATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  PENDING_FIRST_MEETING: "1ère rencontre",
  ACTIVE: "Active",
  PAUSED: "En pause",
  CLOSED: "Fermée",
};

const RELATION_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  PENDING_FIRST_MEETING: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-orange-100 text-orange-800",
  CLOSED: "bg-gray-100 text-gray-600",
};

const INTERVENTION_STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Proposée",
  CONFIRMED: "Confirmée",
  CANCELLED: "Annulée",
  DONE: "Réalisée",
  COMPLETED_PENDING_FEEDBACK: "Feedback attendu",
  COMPLETED: "Terminée",
};

const INTERVENTION_STATUS_COLORS: Record<string, string> = {
  PROPOSED: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  CANCELLED: "bg-gray-100 text-gray-500",
  DONE: "bg-green-100 text-green-800",
  COMPLETED_PENDING_FEEDBACK: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-green-100 text-green-800",
};

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Rencontres : wall-clock Guadeloupe, jamais la timezone du navigateur. */
function formatDateTime(d: string | Date) {
  const date = new Date(d);
  return `${fmtDayLongMonthYear(date)} à ${fmtTime(date)}`;
}

function formatDateShort(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ── StarDisplay ───────────────────────────────────────────────────────────────

function StarDisplay({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground italic">Non noté</span>;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < rating ? "fill-amber-400 text-amber-400" : "text-gray-200 fill-gray-200"}`}
        />
      ))}
    </span>
  );
}

// ── StudentCard (liste principale) ────────────────────────────────────────────

function StudentCard({
  student,
  onClick,
}: {
  student: StudentSummary;
  onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:border-green-400 hover:shadow-sm transition-all"
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={getPhotoUrl(student.profilePhoto)}
              alt={`${student.firstName} ${student.lastName}`}
              className="w-12 h-12 rounded-full object-cover shrink-0"
            />
            <div className="min-w-0">
              <p className="font-semibold truncate">
                {student.firstName} {student.lastName}
              </p>
              {student.schoolName && (
                <p className="text-xs text-muted-foreground truncate">{student.schoolName}</p>
              )}
              {student.city && (
                <p className="text-xs text-muted-foreground">{student.city}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {student.bio ? (
              <Badge className="bg-green-100 text-green-800 text-xs hidden sm:inline-flex">
                Bio ✓
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 text-xs hidden sm:inline-flex">
                Bio à compléter
              </Badge>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Student detail — Profil & Bio ─────────────────────────────────────────────

function ProfilSection({
  data,
  studentId,
  refetch,
}: {
  data: StudentDetail;
  studentId: string;
  refetch: () => void;
}) {
  const { toast } = useToast();
  const { student } = data;

  const [editing, setEditing] = useState(false);
  const [bioValue, setBioValue] = useState("");

  function openEdit() {
    setBioValue(student.bio ?? "");
    setEditing(true);
  }

  const saveMut = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/teacher/students/${studentId}/bio`, {
        bio: bioValue,
      }),
    onSuccess: () => {
      setEditing(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/students"] });
      toast({ title: "Biographie mise à jour" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const bioOk = !!student.bio && student.bio.trim().length > 20;

  return (
    <div className="space-y-4">
      {/* Bio card */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Biographie</h3>
            <div className="flex items-center gap-2">
              {bioOk ? (
                <Badge className="bg-green-100 text-green-800 text-xs gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Complète
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 text-xs gap-1">
                  <AlertCircle className="w-3 h-3" />
                  À compléter
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={openEdit}>
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Modifier
              </Button>
            </div>
          </div>

          {student.bio ? (
            <p className="text-sm leading-relaxed">{student.bio}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Aucune biographie. Cliquez sur "Modifier" pour en rédiger une avec l'élève.
            </p>
          )}

        </CardContent>
      </Card>

      {/* Infos personnelles */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <h3 className="font-semibold">Informations</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {student.email && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Email</Label>
                <p className="text-sm mt-0.5">{student.email}</p>
              </div>
            )}
            {student.phone && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Téléphone</Label>
                <p className="text-sm mt-0.5">{student.phone}</p>
              </div>
            )}
            {student.city && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Ville</Label>
                <p className="text-sm mt-0.5">{student.city}</p>
              </div>
            )}
            {student.schoolName && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">École</Label>
                <p className="text-sm mt-0.5">{student.schoolName}</p>
              </div>
            )}
            {student.birthDate && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Date de naissance
                </Label>
                <p className="text-sm mt-0.5">{formatDate(student.birthDate)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bio edit dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Biographie de {student.firstName} {student.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Biographie</Label>
              <Textarea
                rows={6}
                value={bioValue}
                onChange={(e) => setBioValue(e.target.value)}
                placeholder="Décrivez le parcours, les centres d'intérêt, les motivations de l'élève..."
                className="resize-none"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">{bioValue.length}/500</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Annuler
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Student detail — Relations & Séniors ──────────────────────────────────────

function RelationsSection({ data }: { data: StudentDetail }) {
  const { relations } = data;

  if (relations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Aucune relation enregistrée pour cet élève.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {relations.map((rel) => {
        const relInterventions = rel.interventions ?? [];
        const meetingsDone = relInterventions.filter(
          (i) => i.status === "COMPLETED" || i.status === "DONE"
        ).length;
        const nextMeeting = relInterventions
          .filter((i) => isUpcomingOrOngoing(i, new Date()))
          .sort(
            (a, b) =>
              new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
          )[0];

        return (
          <Card key={rel.id}>
            <CardContent className="pt-5 space-y-4">
              {/* Senior info */}
              <div className="flex items-center gap-3">
                <img
                  src={getPhotoUrl(rel.senior.profilePhoto)}
                  alt={`${rel.senior.firstName} ${rel.senior.lastName}`}
                  className="w-14 h-14 rounded-full object-cover"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">
                      {rel.senior.firstName} {rel.senior.lastName}
                    </p>
                    <Badge className="bg-blue-100 text-blue-800 text-xs">Sénior</Badge>
                    <Badge
                      className={`text-xs ${RELATION_STATUS_COLORS[rel.status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {RELATION_STATUS_LABELS[rel.status] || rel.status}
                    </Badge>
                  </div>
                  {rel.senior.city && (
                    <p className="text-xs text-muted-foreground mt-0.5">{rel.senior.city}</p>
                  )}
                  {rel.senior.bio && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {rel.senior.bio}
                    </p>
                  )}
                </div>
              </div>

              {/* Résumé relation */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                <div className="text-center">
                  <p className="text-xl font-bold text-green-600">{meetingsDone}</p>
                  <p className="text-xs text-muted-foreground">
                    Rencontre{meetingsDone > 1 ? "s" : ""} réalisée{meetingsDone > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-blue-600">{relInterventions.length}</p>
                  <p className="text-xs text-muted-foreground">Total planifié</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Depuis</p>
                  <p className="text-xs font-medium">{formatDate(rel.createdAt)}</p>
                </div>
              </div>

              {/* Prochaine rencontre */}
              {nextMeeting && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-200">
                  <Clock className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-blue-900">
                      Prochaine rencontre : {formatDateTime(nextMeeting.scheduledDate)}
                    </p>
                    {nextMeeting.location && (
                      <p className="text-xs text-blue-700">{nextMeeting.location}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Student detail — Notes FEVES ──────────────────────────────────────────────

function NotesSection({
  data,
  studentId,
  refetch,
}: {
  data: StudentDetail;
  studentId: string;
  refetch: () => void;
}) {
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  const [editingComment, setEditingComment] = useState<CommentItem | null>(null);
  const [editText, setEditText] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/teacher/students/${studentId}/comments`, {
        content: commentText,
      }),
    onSuccess: () => {
      setCommentText("");
      refetch();
      toast({
        title: "Note envoyée",
        description: "L'équipe FEVES a été notifiée par email.",
      });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (c: CommentItem) =>
      apiRequest("PATCH", `/api/teacher/students/${studentId}/comments/${c.id}`, {
        content: editText,
      }),
    onSuccess: () => {
      setEditingComment(null);
      refetch();
      toast({ title: "Note modifiée" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/teacher/students/${studentId}/comments/${id}`),
    onSuccess: () => {
      refetch();
      toast({ title: "Note supprimée" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Écrire une note */}
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="pt-5 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Ajouter une note à l'intention de FEVES</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Visible uniquement par l'équipe FEVES. L'équipe recevra un email à chaque nouvelle note.
            </p>
          </div>
          <Textarea
            placeholder="Observations, points d'attention particuliers, évolutions constatées..."
            rows={4}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="resize-none bg-white"
          />
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            disabled={!commentText.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Plus className="w-4 h-4 mr-1" />
            )}
            Envoyer à l'équipe FEVES
          </Button>
        </CardContent>
      </Card>

      {/* Liste des notes */}
      {data.comments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune note envoyée.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {data.comments.length} note{data.comments.length > 1 ? "s" : ""} envoyée{data.comments.length > 1 ? "s" : ""}
          </p>
          {data.comments.map((c) => (
            <Card key={c.id} className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 space-y-1">
                    <p className="text-sm leading-relaxed">{c.content}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.teacherName} · {formatDate(c.createdAt)}
                    </p>
                  </div>
                  {c.isOwn && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingComment(c);
                          setEditText(c.content);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMut.mutate(c.id)}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editingComment} onOpenChange={(o) => { if (!o) setEditingComment(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la note</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={5}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingComment(null)}>
              Annuler
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!editText.trim() || updateMut.isPending}
              onClick={() => editingComment && updateMut.mutate(editingComment)}
            >
              {updateMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Student detail view ───────────────────────────────────────────────────────

type DetailSection = "profil" | "relations" | "rencontres" | "notes";

function StudentDetailView({
  studentId,
  studentName,
  onBack,
}: {
  studentId: string;
  studentName: string;
  onBack: () => void;
}) {
  const [section, setSection] = useState<DetailSection>("profil");

  const { data, isLoading, refetch } = useQuery<StudentDetail>({
    queryKey: [`/api/teacher/students/${studentId}`],
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const { student, relations = [], comments = [] } = data;

  // Toutes interventions réalisées
  const allInterventions = relations.flatMap((r) => r.interventions ?? []);
  const doneCount = allInterventions.filter(
    (i) => i.status === "COMPLETED" || i.status === "DONE"
  ).length;
  const activeRelation = relations.find(
    (r) => r.status === "ACTIVE" || r.status === "PENDING_FIRST_MEETING"
  );

  const SECTIONS: { id: DetailSection; label: string; icon: any; count?: number }[] = [
    { id: "profil", label: "Profil & Bio", icon: User },
    { id: "relations", label: "Séniors", icon: Users, count: relations.length },
    { id: "rencontres", label: "Suivi des ateliers", icon: Calendar, count: allInterventions.length },
    { id: "notes", label: "Notes FEVES", icon: MessageSquare, count: comments.length },
  ];

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour à la liste
      </button>

      {/* Student header */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-4">
            <img
              src={getPhotoUrl(student.profilePhoto)}
              alt={`${student.firstName} ${student.lastName}`}
              className="w-16 h-16 rounded-full object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xl font-bold">
                {student.firstName} {student.lastName}
              </p>
              {student.schoolName && (
                <p className="text-sm text-muted-foreground">{student.schoolName}</p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {activeRelation ? (
                  <Badge className="bg-green-100 text-green-800 text-xs">
                    En relation avec {activeRelation.senior.firstName} {activeRelation.senior.lastName}
                  </Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-600 text-xs">Sans relation active</Badge>
                )}
                <Badge className={`text-xs ${student.bio ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                  Bio {student.bio ? "✓" : "à compléter"}
                </Badge>
              </div>
            </div>
            <div className="text-center shrink-0 hidden sm:block">
              <p className="text-2xl font-bold text-green-600">{doneCount}</p>
              <p className="text-xs text-muted-foreground">rencontre{doneCount > 1 ? "s" : ""}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section tabs */}
      <MobileTabsMenu
        tabs={SECTIONS}
        activeTab={section}
        onSelect={(id) => setSection(id as DetailSection)}
        getBadgeCount={(id) => SECTIONS.find((s) => s.id === id)?.count ?? 0}
        accentClassName="bg-green-600 text-white"
      />

      <div className="hidden md:flex gap-2 flex-wrap">
        {SECTIONS.map((s) => {
          const isActive = section === s.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? "bg-green-600 text-white"
                  : "bg-white text-muted-foreground hover:bg-muted border border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {s.label}
              {s.count !== undefined && s.count > 0 && (
                <Badge
                  className={`ml-0.5 text-[10px] px-1.5 py-0 ${
                    isActive ? "bg-white text-green-600" : "bg-green-600 text-white"
                  }`}
                >
                  {s.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Section content */}
      {section === "profil" && (
        <ProfilSection data={data} studentId={studentId} refetch={refetch} />
      )}
      {section === "relations" && <RelationsSection data={data} />}
      {section === "rencontres" && (
        <MeetingHistory
          scope={{ kind: "user", userId: studentId }}
          viewerRole="TEACHER"
          emptyLabel="Aucune rencontre planifiée."
          exportLabel={`${data.student.firstName}-${data.student.lastName}`}
        />
      )}
      {section === "notes" && (
        <NotesSection data={data} studentId={studentId} refetch={refetch} />
      )}
    </div>
  );
}

// ── Profil tab (mon compte) ───────────────────────────────────────────────────

function MonCompteTab() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-md">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-4 mb-4">
            <img
              src={getPhotoUrl(user.profilePhoto)}
              alt={`${user.firstName} ${user.lastName}`}
              className="w-16 h-16 rounded-full object-cover"
            />
            <div>
              <p className="font-bold text-lg">
                {user.firstName} {user.lastName}
              </p>
              <Badge className="bg-green-100 text-green-800 text-xs">Professeur référent</Badge>
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Email</Label>
            <p className="font-medium mt-0.5">{user.email}</p>
          </div>
          {user.phone && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Téléphone</Label>
              <p className="font-medium mt-0.5">{user.phone}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground text-center mt-4">
        Pour modifier vos informations, contactez l'équipe FEVES.
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const MAIN_TABS = [
  { id: "suivi", label: "Suivi des élèves", icon: GraduationCap },
  { id: "compte", label: "Mon compte", icon: User },
] as const;

type MainTabId = typeof MAIN_TABS[number]["id"];

export default function TeacherHome() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<MainTabId>("suivi");
  const [selectedStudent, setSelectedStudent] = useState<{ id: string; name: string } | null>(null);

  const { data: students = [], isLoading } = useQuery<StudentSummary[]>({
    queryKey: ["/api/teacher/students"],
    enabled: !!user,
  });

  if (!user) return null;

  // Vue détail
  if (selectedStudent) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <StudentDetailView
          studentId={selectedStudent.id}
          studentName={selectedStudent.name}
          onBack={() => setSelectedStudent(null)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Bonjour {user.firstName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Espace professeur référent</p>
        </div>
        <Badge className="bg-green-100 text-green-800">Professeur</Badge>
      </div>

      {/* Tabs */}
      <MobileTabsMenu
        tabs={MAIN_TABS}
        activeTab={activeTab}
        onSelect={(id) => setActiveTab(id as MainTabId)}
        getBadgeCount={(id) => (id === "suivi" ? students.length : 0)}
        accentClassName="bg-green-600 text-white"
      />

      <div className="hidden md:flex flex-wrap gap-2 mb-8">
        {MAIN_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-green-600 text-white"
                  : "bg-white text-muted-foreground hover:bg-muted border border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.id === "suivi" && students.length > 0 && (
                <Badge
                  className={`ml-1 text-[10px] px-1.5 py-0 ${
                    isActive ? "bg-white text-green-600" : "bg-green-600 text-white"
                  }`}
                >
                  {students.length}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === "suivi" && (
        <>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <GraduationCap className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Aucun élève affilié</p>
              <p className="text-sm mt-1">
                Contactez l'équipe FEVES pour affecter des élèves à votre suivi.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {students.length} élève{students.length > 1 ? "s" : ""} sous votre suivi — cliquez sur un élève pour accéder à son dossier complet.
              </p>
              {students.map((s) => (
                <StudentCard
                  key={s.id}
                  student={s}
                  onClick={() =>
                    setSelectedStudent({ id: s.id, name: `${s.firstName} ${s.lastName}` })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "compte" && <MonCompteTab />}
    </div>
  );
}
