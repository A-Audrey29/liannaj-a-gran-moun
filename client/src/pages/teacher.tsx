import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getPhotoUrl } from "@/lib/photo-url";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutGrid,
  Users,
  ChevronRight,
  ChevronLeft,
  Loader2,
  User,
  MessageSquare,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Building2,
  GraduationCap,
} from "lucide-react";
import type { User as UserType, Internship, TeacherComment } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

type StudentSummary = UserType & { linkedAt: string };

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
  senior: UserType | null;
  internships: Internship[];
  comments: CommentItem[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERNSHIP_STATUS_LABELS: Record<string, string> = {
  UPCOMING: "À venir",
  ONGOING: "En cours",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};

const INTERNSHIP_STATUS_COLORS: Record<string, string> = {
  UPCOMING: "bg-blue-100 text-blue-800",
  ONGOING: "bg-green-100 text-green-800",
  COMPLETED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-red-100 text-red-700",
};

const TABS = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { id: "eleves", label: "Mes élèves", icon: Users },
  { id: "profil", label: "Mon compte", icon: User },
] as const;

type TabId = typeof TABS[number]["id"];

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function DashboardTab({
  students,
  onSelectStudent,
}: {
  students: StudentSummary[];
  onSelectStudent: (s: StudentSummary) => void;
}) {
  const ongoingCount = students.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-3xl font-bold text-green-600">{ongoingCount}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Élève{ongoingCount > 1 ? "s" : ""} suivi{ongoingCount > 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {students.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aucun élève affilié pour le moment.</p>
          <p className="text-sm mt-1">Contactez l'équipe FEVES pour ajouter des élèves.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Mes élèves
          </h2>
          {students.map((s) => (
            <Card
              key={s.id}
              className="cursor-pointer hover:border-green-300 transition-colors"
              onClick={() => onSelectStudent(s)}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={getPhotoUrl(s.profilePhoto)}
                      alt={`${s.firstName} ${s.lastName}`}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-medium">
                        {s.firstName} {s.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.city || "Ville non renseignée"}
                        {s.schoolName ? ` · ${s.schoolName}` : ""}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Students list tab ─────────────────────────────────────────────────────────

function ElevesTab({
  students,
  onSelectStudent,
}: {
  students: StudentSummary[];
  onSelectStudent: (s: StudentSummary) => void;
}) {
  if (students.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Aucun élève affilié.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {students.map((s) => (
        <Card
          key={s.id}
          className="cursor-pointer hover:border-green-300 transition-colors"
          onClick={() => onSelectStudent(s)}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={getPhotoUrl(s.profilePhoto)}
                  alt={`${s.firstName} ${s.lastName}`}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold">
                    {s.firstName} {s.lastName}
                  </p>
                  {s.schoolName && (
                    <p className="text-xs text-muted-foreground">{s.schoolName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Affilié le {formatDate(s.linkedAt)}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Student detail view ───────────────────────────────────────────────────────

type DetailSection = "profil" | "stages" | "commentaires";

function StudentDetailView({
  studentId,
  onBack,
}: {
  studentId: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [section, setSection] = useState<DetailSection>("profil");

  const { data, isLoading, refetch } = useQuery<StudentDetail>({
    queryKey: [`/api/teacher/students/${studentId}`],
  });

  // ── Bio edition ─────────────────────────────────────────────────────────────
  const [editingBio, setEditingBio] = useState(false);
  const [bioValue, setBioValue] = useState("");
  const [activityValue, setActivityValue] = useState("");

  function openBioEdit() {
    setBioValue(data?.student.bio ?? "");
    setActivityValue(data?.student.desiredActivity ?? "");
    setEditingBio(true);
  }

  const bioMut = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/teacher/students/${studentId}/bio`, {
        bio: bioValue,
        desiredActivity: activityValue,
      }),
    onSuccess: () => {
      setEditingBio(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/students"] });
      toast({ title: "Biographie mise à jour" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  // ── Comments ────────────────────────────────────────────────────────────────
  const [commentText, setCommentText] = useState("");
  const [editingComment, setEditingComment] = useState<CommentItem | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

  const createCommentMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/teacher/students/${studentId}/comments`, { content: commentText }),
    onSuccess: () => {
      setCommentText("");
      refetch();
      toast({ title: "Commentaire ajouté" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const updateCommentMut = useMutation({
    mutationFn: (c: CommentItem) =>
      apiRequest("PATCH", `/api/teacher/students/${studentId}/comments/${c.id}`, {
        content: editCommentText,
      }),
    onSuccess: () => {
      setEditingComment(null);
      refetch();
      toast({ title: "Commentaire modifié" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const deleteCommentMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/teacher/students/${studentId}/comments/${id}`),
    onSuccess: () => {
      refetch();
      toast({ title: "Commentaire supprimé" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  // ── Internships ─────────────────────────────────────────────────────────────
  const [showInternshipForm, setShowInternshipForm] = useState(false);
  const [editingInternship, setEditingInternship] = useState<Internship | null>(null);
  const emptyForm = {
    companyName: "",
    companyAddress: "",
    supervisorName: "",
    supervisorEmail: "",
    startDate: "",
    endDate: "",
    description: "",
    status: "UPCOMING" as string,
    teacherNotes: "",
  };
  const [internshipForm, setInternshipForm] = useState(emptyForm);

  function openNewInternship() {
    setInternshipForm(emptyForm);
    setEditingInternship(null);
    setShowInternshipForm(true);
  }

  function openEditInternship(i: Internship) {
    setInternshipForm({
      companyName: i.companyName,
      companyAddress: i.companyAddress ?? "",
      supervisorName: i.supervisorName ?? "",
      supervisorEmail: i.supervisorEmail ?? "",
      startDate: i.startDate ? new Date(i.startDate).toISOString().split("T")[0] : "",
      endDate: i.endDate ? new Date(i.endDate).toISOString().split("T")[0] : "",
      description: i.description ?? "",
      status: i.status,
      teacherNotes: i.teacherNotes ?? "",
    });
    setEditingInternship(i);
    setShowInternshipForm(true);
  }

  const saveInternshipMut = useMutation({
    mutationFn: () => {
      if (editingInternship) {
        return apiRequest(
          "PATCH",
          `/api/teacher/students/${studentId}/internships/${editingInternship.id}`,
          internshipForm
        );
      }
      return apiRequest("POST", `/api/teacher/students/${studentId}/internships`, internshipForm);
    },
    onSuccess: () => {
      setShowInternshipForm(false);
      refetch();
      toast({ title: editingInternship ? "Stage modifié" : "Stage ajouté" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const deleteInternshipMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/teacher/students/${studentId}/internships/${id}`),
    onSuccess: () => {
      refetch();
      toast({ title: "Stage supprimé" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const { student, senior, internships, comments } = data;

  const SECTIONS: { id: DetailSection; label: string; icon: any }[] = [
    { id: "profil", label: "Profil & Bio", icon: User },
    { id: "stages", label: `Stages (${internships.length})`, icon: Briefcase },
    { id: "commentaires", label: `Notes (${comments.length})`, icon: MessageSquare },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
          Retour
        </button>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-4">
            <img
              src={getPhotoUrl(student.profilePhoto)}
              alt={`${student.firstName} ${student.lastName}`}
              className="w-16 h-16 rounded-full object-cover"
            />
            <div>
              <p className="text-xl font-bold">
                {student.firstName} {student.lastName}
              </p>
              {student.schoolName && (
                <p className="text-sm text-muted-foreground">{student.schoolName}</p>
              )}
              {student.city && (
                <p className="text-sm text-muted-foreground">{student.city}</p>
              )}
            </div>
          </div>

          {senior && (
            <div className="mt-4 pt-4 border-t flex items-center gap-3">
              <img
                src={getPhotoUrl(senior.profilePhoto)}
                alt={`${senior.firstName} ${senior.lastName}`}
                className="w-10 h-10 rounded-full object-cover"
              />
              <div>
                <p className="text-xs text-muted-foreground">Sénior affilié</p>
                <p className="font-medium text-sm">
                  {senior.firstName} {senior.lastName}
                </p>
                {senior.city && (
                  <p className="text-xs text-muted-foreground">{senior.city}</p>
                )}
              </div>
              <Badge className="ml-auto bg-blue-100 text-blue-800 text-xs">Sénior</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section tabs */}
      <div className="flex gap-2 flex-wrap">
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
                  : "bg-white text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ── PROFIL SECTION ─────────────────────────────────────────────── */}
      {section === "profil" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">Biographie</h3>
                <Button variant="outline" size="sm" onClick={openBioEdit}>
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                  Modifier
                </Button>
              </div>
              {student.bio ? (
                <p className="text-sm text-foreground leading-relaxed">{student.bio}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Aucune biographie rédigée. Cliquez sur "Modifier" pour en rédiger une.
                </p>
              )}

              {student.desiredActivity && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    Activité souhaitée
                  </p>
                  <p className="text-sm">{student.desiredActivity}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STAGES SECTION ─────────────────────────────────────────────── */}
      {section === "stages" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={openNewInternship}
            >
              <Plus className="w-4 h-4 mr-1" />
              Ajouter un stage
            </Button>
          </div>

          {internships.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Aucun stage enregistré.</p>
            </div>
          ) : (
            internships.map((i) => (
              <Card key={i.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{i.companyName}</p>
                        <Badge
                          className={`text-xs ${
                            INTERNSHIP_STATUS_COLORS[i.status] || ""
                          }`}
                        >
                          {INTERNSHIP_STATUS_LABELS[i.status] || i.status}
                        </Badge>
                      </div>
                      {i.companyAddress && (
                        <p className="text-xs text-muted-foreground">{i.companyAddress}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDate(i.startDate)}
                        {i.endDate ? ` → ${formatDate(i.endDate)}` : " → en cours"}
                      </p>
                      {i.supervisorName && (
                        <p className="text-xs text-muted-foreground">
                          Tuteur : {i.supervisorName}
                          {i.supervisorEmail ? ` (${i.supervisorEmail})` : ""}
                        </p>
                      )}
                      {i.description && (
                        <p className="text-sm mt-1">{i.description}</p>
                      )}
                      {i.teacherNotes && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                          <span className="font-medium text-amber-800">Notes prof : </span>
                          <span className="text-amber-900">{i.teacherNotes}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditInternship(i)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteInternshipMut.mutate(i.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── COMMENTAIRES SECTION ───────────────────────────────────────── */}
      {section === "commentaires" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-3">
              <h3 className="font-semibold text-sm">
                Ajouter une note interne
              </h3>
              <p className="text-xs text-muted-foreground">
                Ces notes sont visibles uniquement par l'équipe FEVES et les professeurs.
              </p>
              <Textarea
                placeholder="Observations, points d'attention, suivi..."
                rows={3}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="resize-none"
              />
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                disabled={!commentText.trim() || createCommentMut.isPending}
                onClick={() => createCommentMut.mutate()}
              >
                {createCommentMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Plus className="w-4 h-4 mr-1" />
                )}
                Enregistrer la note
              </Button>
            </CardContent>
          </Card>

          {comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucune note enregistrée.</p>
            </div>
          ) : (
            comments.map((c) => (
              <Card key={c.id} className="border-l-4 border-l-green-400">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm leading-relaxed">{c.content}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.teacherName} · {formatDate(c.createdAt)}
                        {c.updatedAt !== c.createdAt && " (modifié)"}
                      </p>
                    </div>
                    {c.isOwn && (
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingComment(c);
                            setEditCommentText(c.content);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteCommentMut.mutate(c.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Bio edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={editingBio} onOpenChange={setEditingBio}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Modifier la biographie de {student.firstName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Biographie</Label>
              <Textarea
                rows={5}
                value={bioValue}
                onChange={(e) => setBioValue(e.target.value)}
                placeholder="Décrivez le parcours, les centres d'intérêt..."
                className="resize-none"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {bioValue.length}/500
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Activité souhaitée</Label>
              <Input
                value={activityValue}
                onChange={(e) => setActivityValue(e.target.value)}
                placeholder="Ex : aide informatique, jardinage..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBio(false)}>
              Annuler
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={bioMut.isPending}
              onClick={() => bioMut.mutate()}
            >
              {bioMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Comment edit dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!editingComment}
        onOpenChange={(o) => { if (!o) setEditingComment(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la note</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={4}
            value={editCommentText}
            onChange={(e) => setEditCommentText(e.target.value)}
            className="resize-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingComment(null)}>
              Annuler
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!editCommentText.trim() || updateCommentMut.isPending}
              onClick={() => editingComment && updateCommentMut.mutate(editingComment)}
            >
              {updateCommentMut.isPending && (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              )}
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Internship form dialog ──────────────────────────────────────── */}
      <Dialog open={showInternshipForm} onOpenChange={setShowInternshipForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingInternship ? "Modifier le stage" : "Nouveau stage"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>
                Entreprise <span className="text-destructive">*</span>
              </Label>
              <Input
                value={internshipForm.companyName}
                onChange={(e) =>
                  setInternshipForm((f) => ({ ...f, companyName: e.target.value }))
                }
                placeholder="Nom de l'entreprise"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Input
                value={internshipForm.companyAddress}
                onChange={(e) =>
                  setInternshipForm((f) => ({ ...f, companyAddress: e.target.value }))
                }
                placeholder="Ville, département..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Date de début <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  value={internshipForm.startDate}
                  onChange={(e) =>
                    setInternshipForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date de fin</Label>
                <Input
                  type="date"
                  value={internshipForm.endDate}
                  onChange={(e) =>
                    setInternshipForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select
                value={internshipForm.status}
                onValueChange={(v) =>
                  setInternshipForm((f) => ({ ...f, status: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPCOMING">À venir</SelectItem>
                  <SelectItem value="ONGOING">En cours</SelectItem>
                  <SelectItem value="COMPLETED">Terminé</SelectItem>
                  <SelectItem value="CANCELLED">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nom du tuteur</Label>
              <Input
                value={internshipForm.supervisorName}
                onChange={(e) =>
                  setInternshipForm((f) => ({ ...f, supervisorName: e.target.value }))
                }
                placeholder="Prénom Nom"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email du tuteur</Label>
              <Input
                type="email"
                value={internshipForm.supervisorEmail}
                onChange={(e) =>
                  setInternshipForm((f) => ({ ...f, supervisorEmail: e.target.value }))
                }
                placeholder="tuteur@entreprise.fr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description de la mission</Label>
              <Textarea
                rows={3}
                value={internshipForm.description}
                onChange={(e) =>
                  setInternshipForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Activités prévues, objectifs..."
                className="resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes internes (prof)</Label>
              <Textarea
                rows={2}
                value={internshipForm.teacherNotes}
                onChange={(e) =>
                  setInternshipForm((f) => ({ ...f, teacherNotes: e.target.value }))
                }
                placeholder="Observations réservées à l'équipe FEVES..."
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInternshipForm(false)}>
              Annuler
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!internshipForm.companyName.trim() || !internshipForm.startDate || saveInternshipMut.isPending}
              onClick={() => saveInternshipMut.mutate()}
            >
              {saveInternshipMut.isPending && (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              )}
              {editingInternship ? "Modifier" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Profil tab ─────────────────────────────────────────────────────────────────

function ProfilTab() {
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
              <Badge className="bg-green-100 text-green-800 text-xs">
                Professeur référent
              </Badge>
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              Email
            </Label>
            <p className="font-medium mt-0.5">{user.email}</p>
          </div>
          {user.phone && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                Téléphone
              </Label>
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

export default function TeacherHome() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const { data: students = [], isLoading } = useQuery<StudentSummary[]>({
    queryKey: ["/api/teacher/students"],
    enabled: !!user,
  });

  if (!user) return null;

  function selectStudent(s: StudentSummary) {
    setSelectedStudentId(s.id);
  }

  function clearStudent() {
    setSelectedStudentId(null);
  }

  // If a student is selected, show detail view (from any tab)
  if (selectedStudentId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <StudentDetailView studentId={selectedStudentId} onBack={clearStudent} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Bonjour {user.firstName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Espace professeur référent
          </p>
        </div>
        <Badge className="bg-green-100 text-green-800">Professeur</Badge>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-green-600 text-white"
                  : "bg-white text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.id === "eleves" && students.length > 0 && (
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
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          {activeTab === "dashboard" && (
            <DashboardTab students={students} onSelectStudent={selectStudent} />
          )}
          {activeTab === "eleves" && (
            <ElevesTab students={students} onSelectStudent={selectStudent} />
          )}
          {activeTab === "profil" && <ProfilTab />}
        </>
      )}
    </div>
  );
}
