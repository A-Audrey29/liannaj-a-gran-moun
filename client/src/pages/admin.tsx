import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Link2,
  Shield,
  CreditCard,
  CheckCircle,
  XCircle,
  Trash2,
  Ban,
  Calendar,
  MapPin,
  Clock,
  Loader2,
  UserCog,
  UserPlus,
  Search,
  Bell,
  Eye,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { User, Relation, Intervention, PaymentRecord, Notification } from "@shared/schema";

type SafeUser = Omit<User, "password" | "validationToken" | "validationExpiry">;
type RelationWithUsers = Relation & { senior: SafeUser; junior: SafeUser };
type PaymentWithUser = PaymentRecord & { user: SafeUser };
type InterventionWithRelation = Intervention & { relation: Relation & { senior: SafeUser; junior: SafeUser } };
type NotificationWithUser = Notification & { user: SafeUser };

const ADMIN_TABS = [
  { id: "utilisateurs", label: "Utilisateurs", icon: Users },
  { id: "relations", label: "Relations", icon: Link2 },
  { id: "rencontres", label: "Rencontres", icon: Calendar },
  { id: "cadrage", label: "Cadrage", icon: Shield },
  { id: "paiements", label: "Paiements", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "mon-compte", label: "Mon compte", icon: UserCog },
  { id: "creer-admin", label: "Créer un admin", icon: UserPlus },
] as const;

const STATUS_COLORS: Record<string, string> = {
  PENDING_VALIDATION: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-red-100 text-red-800",
  BANNED: "bg-gray-100 text-gray-800",
  PENDING: "bg-amber-100 text-amber-800",
  PENDING_FIRST_MEETING: "bg-blue-100 text-blue-800",
  CLOSED: "bg-gray-100 text-gray-800",
  PAUSED: "bg-orange-100 text-orange-800",
  PROPOSED: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  CANCELLED: "bg-gray-100 text-gray-600",
  COMPLETED_PENDING_FEEDBACK: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-green-100 text-green-800",
  DONE: "bg-green-100 text-green-800",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_VALIDATION: "En attente",
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  BANNED: "Banni",
  PENDING: "En attente",
  PENDING_FIRST_MEETING: "1ère rencontre",
  CLOSED: "Fermée",
  PAUSED: "En pause",
  PROPOSED: "Proposée",
  CONFIRMED: "Confirmée",
  CANCELLED: "Annulée",
  COMPLETED_PENDING_FEEDBACK: "Feedback attendu",
  COMPLETED: "Terminée",
  DONE: "Réalisée",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-800",
  SENIOR: "bg-blue-100 text-blue-800",
  JUNIOR: "bg-teal-100 text-teal-800",
};

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ==================== UTILISATEURS ====================

function UsersTab() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: users = [], isLoading } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  const validateMut = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/users/${id}/validate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur validé" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de valider l'utilisateur", variant: "destructive" }),
  });

  const suspendMut = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/users/${id}/suspend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur suspendu" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de suspendre l'utilisateur", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Utilisateur supprimé" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de supprimer l'utilisateur", variant: "destructive" }),
  });

  function openProfile(u: SafeUser) {
    setSelectedUser(u);
    setProfileOpen(true);
  }

  const pendingCount = users.filter((u) => u.status === "PENDING_VALIDATION").length;
  const searchLower = search.toLowerCase();

  const filtered = users.filter((u) => {
    if (filter !== "all" && u.status !== filter) return false;
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (search && !`${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  const filters = [
    { id: "all", label: "Tous" },
    { id: "PENDING_VALIDATION", label: "En attente" },
    { id: "ACTIVE", label: "Actifs" },
    { id: "SUSPENDED", label: "Suspendus" },
  ];

  const roleFilters = [
    { id: "all", label: "Tous les rôles" },
    { id: "SENIOR", label: "Seniors" },
    { id: "JUNIOR", label: "Juniors" },
    { id: "ADMIN", label: "Admins" },
  ];

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-amber-800 text-sm font-medium" data-testid="text-pending-count">
          {pendingCount} utilisateur{pendingCount > 1 ? "s" : ""} en attente de validation
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom, prénom ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-users"
        />
      </div>

      <div className="flex gap-2 mb-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.id ? "bg-[#dc4256] text-white" : "bg-white text-muted-foreground hover:bg-muted border"
            }`}
            data-testid={`filter-users-${f.id}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {roleFilters.map((f) => (
          <button
            key={f.id}
            onClick={() => setRoleFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              roleFilter === f.id ? "bg-[#dc4256] text-white" : "bg-white text-muted-foreground hover:bg-muted border"
            }`}
            data-testid={`filter-role-${f.id}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((u) => (
          <div key={u.id} className="bg-white rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid={`card-user-${u.id}`}>
            <div className="flex-1 min-w-0">
              <button
                onClick={() => openProfile(u)}
                className="font-medium text-[#dc4256] hover:underline cursor-pointer truncate"
                data-testid={`link-user-${u.id}`}
              >
                {u.firstName} {u.lastName}
              </button>
              <div className="text-sm text-muted-foreground truncate">{u.email}</div>
              {u.referentFirstName && u.referentLastName && (
                <div className="text-xs text-muted-foreground">Réf: {u.referentTitle || ""} {u.referentFirstName} {u.referentLastName}</div>
              )}
              <div className="text-xs text-muted-foreground mt-1">Inscrit le {formatDate(u.createdAt)}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className={ROLE_COLORS[u.role] || ""}>{u.role}</Badge>
              <Badge className={STATUS_COLORS[u.status] || ""}>{STATUS_LABELS[u.status] || u.status}</Badge>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              {u.status === "PENDING_VALIDATION" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-700 border-green-300 hover:bg-green-50"
                    onClick={() => validateMut.mutate(u.id)}
                    disabled={validateMut.isPending}
                    data-testid={`btn-validate-${u.id}`}
                  >
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-gray-600"
                    onClick={() => suspendMut.mutate(u.id)}
                    disabled={suspendMut.isPending}
                    data-testid={`btn-refuse-${u.id}`}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />Refuser
                  </Button>
                </>
              )}
              {u.status === "ACTIVE" && u.role !== "ADMIN" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-orange-600 border-orange-300 hover:bg-orange-50"
                  onClick={() => suspendMut.mutate(u.id)}
                  disabled={suspendMut.isPending}
                  data-testid={`btn-suspend-${u.id}`}
                >
                  <Ban className="w-3.5 h-3.5 mr-1" />Suspendre
                </Button>
              )}
              {u.role !== "ADMIN" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" data-testid={`btn-delete-${u.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer {u.firstName} {u.lastName} ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible. Toutes les données associées seront supprimées.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMut.mutate(u.id)}
                        className="bg-red-600 hover:bg-red-700"
                        data-testid={`btn-confirm-delete-${u.id}`}
                      >
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">Aucun utilisateur trouvé</div>
        )}
      </div>
      <ProfileDialog user={selectedUser} open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}

// ==================== RELATIONS ====================

function RelationsTab() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: relations = [], isLoading } = useQuery<RelationWithUsers[]>({ queryKey: ["/api/admin/relations"] });

  const closeMut = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/relations/${id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/relations"] });
      toast({ title: "Relation fermée" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de fermer la relation", variant: "destructive" }),
  });

  function openProfile(user: SafeUser) {
    setSelectedUser(user);
    setProfileOpen(true);
  }

  const searchLower = search.toLowerCase();
  const filtered = relations.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search && !`${r.senior.firstName} ${r.senior.lastName} ${r.junior.firstName} ${r.junior.lastName}`.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  const filters = [
    { id: "all", label: "Toutes" },
    { id: "PENDING", label: "En attente" },
    { id: "PENDING_FIRST_MEETING", label: "1ère rencontre" },
    { id: "ACTIVE", label: "Actives" },
    { id: "CLOSED", label: "Fermées" },
  ];

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-relations"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.id ? "bg-[#dc4256] text-white" : "bg-white text-muted-foreground hover:bg-muted border"
            }`}
            data-testid={`filter-relations-${f.id}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((r) => (
          <div
            key={r.id}
            className="bg-white rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            data-testid={`card-relation-${r.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => openProfile(r.senior)}
                  className="font-medium text-[#dc4256] hover:underline cursor-pointer"
                  data-testid={`link-senior-rel-${r.id}`}
                >
                  {r.senior.firstName} {r.senior.lastName}
                </button>
                <span className="text-muted-foreground">↔</span>
                <button
                  onClick={() => openProfile(r.junior)}
                  className="font-medium text-[#dc4256] hover:underline cursor-pointer"
                  data-testid={`link-junior-rel-${r.id}`}
                >
                  {r.junior.firstName} {r.junior.lastName}
                </button>
              </div>
              <div className="text-xs text-muted-foreground mt-1">Créée le {formatDate(r.createdAt)}</div>
            </div>
            <Badge className={STATUS_COLORS[r.status] || ""}>{STATUS_LABELS[r.status] || r.status}</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/relations/${r.id}`)}
              data-testid={`btn-view-relation-${r.id}`}
            >
              <Eye className="w-3.5 h-3.5 mr-1" />Voir
            </Button>
            {r.status !== "CLOSED" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    data-testid={`btn-close-relation-${r.id}`}
                  >
                    Fermer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Fermer cette relation ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      La relation entre {r.senior.firstName} et {r.junior.firstName} sera définitivement fermée.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => closeMut.mutate(r.id)}
                      className="bg-red-600 hover:bg-red-700"
                      data-testid={`btn-confirm-close-${r.id}`}
                    >
                      Fermer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">Aucune relation trouvée</div>
        )}
      </div>
      <ProfileDialog user={selectedUser} open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}

// ==================== CADRAGE ====================

function CadrageTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRelation, setSelectedRelation] = useState<RelationWithUsers | null>(null);
  const [formData, setFormData] = useState({
    scheduledDate: "",
    durationMinutes: 120,
    location: "",
    tasks: "",
  });

  const { data: relations = [], isLoading } = useQuery<RelationWithUsers[]>({
    queryKey: ["/api/admin/relations/pending-meeting"],
  });

  const createMut = useMutation({
    mutationFn: (data: { relationId: string; scheduledDate: string; durationMinutes: number; location?: string; tasks?: string[] }) =>
      apiRequest("POST", `/api/relations/${data.relationId}/interventions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/relations/pending-meeting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/relations"] });
      setDialogOpen(false);
      setSelectedRelation(null);
      setFormData({ scheduledDate: "", durationMinutes: 120, location: "", tasks: "" });
      toast({ title: "1ère rencontre organisée" });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de créer l'intervention", variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRelation || !formData.scheduledDate) return;
    createMut.mutate({
      relationId: selectedRelation.id,
      scheduledDate: formData.scheduledDate,
      durationMinutes: formData.durationMinutes,
      location: formData.location || undefined,
      tasks: formData.tasks ? formData.tasks.split(",").map((t) => t.trim()).filter(Boolean) : [],
    });
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const searchLower = search.toLowerCase();
  const filteredRelations = relations.filter((r) => {
    if (search && !`${r.senior.firstName} ${r.senior.lastName} ${r.junior.firstName} ${r.junior.lastName}`.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-cadrage"
        />
      </div>

      {filteredRelations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Aucun cadrage à organiser
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRelations.map((r) => (
            <div key={r.id} className="bg-white rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid={`card-cadrage-${r.id}`}>
              <div className="flex-1">
                <div className="font-medium">
                  {r.senior.firstName} {r.senior.lastName}
                  <span className="text-muted-foreground mx-2">↔</span>
                  {r.junior.firstName} {r.junior.lastName}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Relation créée le {formatDate(r.createdAt)}
                </div>
              </div>
              <Button
                size="sm"
                className="bg-[#dc4256] hover:bg-[#c53a4d] text-white"
                onClick={() => {
                  setSelectedRelation(r);
                  setDialogOpen(true);
                }}
                data-testid={`btn-organiser-${r.id}`}
              >
                <Calendar className="w-3.5 h-3.5 mr-1" />
                Organiser la 1ère rencontre
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Organiser la 1ère rencontre</DialogTitle>
          </DialogHeader>
          {selectedRelation && (
            <div className="text-sm text-muted-foreground mb-2">
              {selectedRelation.senior.firstName} {selectedRelation.senior.lastName} ↔ {selectedRelation.junior.firstName} {selectedRelation.junior.lastName}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="cadrage-date">Date et heure *</Label>
              <Input
                id="cadrage-date"
                type="datetime-local"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                required
                data-testid="input-cadrage-date"
              />
            </div>
            <div>
              <Label htmlFor="cadrage-duration">Durée (minutes)</Label>
              <Input
                id="cadrage-duration"
                type="number"
                min={30}
                max={480}
                value={formData.durationMinutes}
                onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || 120 })}
                data-testid="input-cadrage-duration"
              />
            </div>
            <div>
              <Label htmlFor="cadrage-location">Lieu</Label>
              <Input
                id="cadrage-location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Ex: Bureau FEVES, 15 rue..."
                data-testid="input-cadrage-location"
              />
            </div>
            <div>
              <Label htmlFor="cadrage-tasks">Activités (séparées par des virgules)</Label>
              <Input
                id="cadrage-tasks"
                value={formData.tasks}
                onChange={(e) => setFormData({ ...formData, tasks: e.target.value })}
                placeholder="Ex: Présentation, Tour du quartier"
                data-testid="input-cadrage-tasks"
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="bg-[#dc4256] hover:bg-[#c53a4d]" disabled={createMut.isPending} data-testid="btn-submit-cadrage">
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Créer l'intervention
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== FICHE PROFIL DIALOG ====================

function ProfileDialog({ user, open, onOpenChange }: { user: SafeUser | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!user) return null;

  const fields: { label: string; value: string | null | undefined; show?: boolean }[] = [
    { label: "Email", value: user.email },
    { label: "Rôle", value: user.role },
    { label: "Statut", value: STATUS_LABELS[user.status] || user.status },
    { label: "Téléphone", value: user.phone },
    { label: "Adresse", value: user.address },
    { label: "Ville", value: user.city },
    { label: "Code postal", value: user.postalCode },
    { label: "Date de naissance", value: user.birthDate ? formatDate(user.birthDate) : null },
    { label: "Bio", value: user.bio },
    { label: "Activité souhaitée", value: user.desiredActivity },
    { label: "École", value: user.schoolName, show: user.role === "JUNIOR" },
    { label: "Référent", value: user.referentTitle && user.referentFirstName && user.referentLastName ? `${user.referentTitle} ${user.referentFirstName} ${user.referentLastName}` : null, show: user.role === "JUNIOR" },
    { label: "Email référent", value: user.referentEmail, show: user.role === "JUNIOR" },
    { label: "Personne de confiance", value: user.trustedPersonName },
    { label: "Email personne de confiance", value: user.trustedPersonEmail },
    { label: "Abonnement", value: user.subscriptionActive ? "Actif" : "Inactif" },
    { label: "Inscrit le", value: formatDate(user.createdAt) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user.firstName} {user.lastName}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-4">
          <Badge className={ROLE_COLORS[user.role] || ""}>{user.role}</Badge>
          <Badge className={STATUS_COLORS[user.status] || ""}>{STATUS_LABELS[user.status] || user.status}</Badge>
        </div>
        <div className="space-y-3">
          {fields.filter((f) => f.show !== false && f.value).map((f) => (
            <div key={f.label} className="flex flex-col" data-testid={`profile-field-${f.label}`}>
              <span className="text-xs text-muted-foreground">{f.label}</span>
              <span className="text-sm font-medium">{f.value}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================== RENCONTRES ====================

function RencontresTab() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: interventions = [], isLoading } = useQuery<InterventionWithRelation[]>({
    queryKey: ["/api/admin/interventions"],
  });

  const searchLower = search.toLowerCase();
  const filtered = interventions.filter((i) => {
    if (filter !== "all" && i.status !== filter) return false;
    if (search && !`${i.relation.senior.firstName} ${i.relation.senior.lastName} ${i.relation.junior.firstName} ${i.relation.junior.lastName}`.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  const filters = [
    { id: "all", label: "Toutes" },
    { id: "PROPOSED", label: "Proposées" },
    { id: "CONFIRMED", label: "Confirmées" },
    { id: "COMPLETED_PENDING_FEEDBACK", label: "Feedback attendu" },
    { id: "COMPLETED", label: "Terminées" },
    { id: "CANCELLED", label: "Annulées" },
  ];

  function openProfile(user: SafeUser) {
    setSelectedUser(user);
    setProfileOpen(true);
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-rencontres"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.id ? "bg-[#dc4256] text-white" : "bg-white text-muted-foreground hover:bg-muted border"
            }`}
            data-testid={`filter-rencontres-${f.id}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Aucune rencontre trouvée
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <div key={i.id} className="bg-white rounded-lg border p-4" data-testid={`card-intervention-${i.id}`}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap mb-2">
                    <button
                      onClick={() => openProfile(i.relation.senior)}
                      className="font-medium text-[#dc4256] hover:underline cursor-pointer"
                      data-testid={`link-senior-${i.id}`}
                    >
                      {i.relation.senior.firstName} {i.relation.senior.lastName}
                    </button>
                    <span className="text-muted-foreground">↔</span>
                    <button
                      onClick={() => openProfile(i.relation.junior)}
                      className="font-medium text-[#dc4256] hover:underline cursor-pointer"
                      data-testid={`link-junior-${i.id}`}
                    >
                      {i.relation.junior.firstName} {i.relation.junior.lastName}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(i.scheduledDate).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {i.durationMinutes} min
                    </span>
                    {i.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {i.location}
                      </span>
                    )}
                  </div>
                  {i.tasks && i.tasks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {i.tasks.map((t, idx) => (
                        <span key={idx} className="bg-[#f3eaff] text-[#7c3aed] text-xs px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <Badge className={`flex-shrink-0 ${STATUS_COLORS[i.status] || ""}`}>
                  {STATUS_LABELS[i.status] || i.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProfileDialog user={selectedUser} open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}

// ==================== NOTIFICATIONS ADMIN ====================

const NOTIF_TYPE_COLORS: Record<string, string> = {
  RELATION_REQUEST: "bg-green-100 text-green-800",
  INTERVENTION_PROPOSED: "bg-blue-100 text-blue-800",
  INTERVENTION_CONFIRMED: "bg-indigo-100 text-indigo-800",
  FEEDBACK_REMINDER: "bg-amber-100 text-amber-800",
  SYSTEM: "bg-gray-100 text-gray-700",
};

const NOTIF_TYPE_LABELS: Record<string, string> = {
  RELATION_REQUEST: "Relation",
  INTERVENTION_PROPOSED: "Intervention proposée",
  INTERVENTION_CONFIRMED: "Intervention confirmée",
  FEEDBACK_REMINDER: "Rappel feedback",
  SYSTEM: "Système",
};

function NotificationsAdminTab() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<NotificationWithUser[]>({
    queryKey: ["/api/admin/notifications"],
  });

  function openProfile(user: SafeUser) {
    setSelectedUser(user);
    setProfileOpen(true);
  }

  const types = Array.from(new Set(notifications.map((n) => n.type)));
  const searchLower = search.toLowerCase();
  const filtered = notifications.filter((n) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (search && !`${n.user.firstName} ${n.user.lastName}`.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom d'utilisateur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-notifications"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setTypeFilter("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            typeFilter === "all" ? "bg-[#dc4256] text-white" : "bg-white text-muted-foreground hover:bg-muted border"
          }`}
          data-testid="filter-notif-all"
        >
          Toutes
        </button>
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              typeFilter === t ? "bg-[#dc4256] text-white" : "bg-white text-muted-foreground hover:bg-muted border"
            }`}
            data-testid={`filter-notif-${t}`}
          >
            {NOTIF_TYPE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Aucune notification trouvée
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-notifications">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4">Destinataire</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Titre</th>
                <th className="py-2 pr-4">Message</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2">Lue</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((n) => (
                <tr key={n.id} className="border-b last:border-0" data-testid={`row-notif-${n.id}`}>
                  <td className="py-3 pr-4">
                    <button
                      onClick={() => openProfile(n.user)}
                      className="font-medium text-[#dc4256] hover:underline cursor-pointer"
                      data-testid={`link-notif-user-${n.id}`}
                    >
                      {n.user.firstName} {n.user.lastName}
                    </button>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge className={NOTIF_TYPE_COLORS[n.type] || "bg-gray-100 text-gray-700"}>
                      {NOTIF_TYPE_LABELS[n.type] || n.type}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 max-w-[200px] truncate">{n.title}</td>
                  <td className="py-3 pr-4 max-w-[250px] truncate text-muted-foreground">{n.message}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatDate(n.createdAt)}</td>
                  <td className="py-3">
                    <Badge className={n.isRead ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                      {n.isRead ? "Oui" : "Non"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProfileDialog user={selectedUser} open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}

// ==================== PAIEMENTS ====================

function PaiementsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    userId: "",
    amount: "",
    label: "",
    date: new Date().toISOString().split("T")[0],
  });

  const { data: payments = [], isLoading } = useQuery<PaymentWithUser[]>({ queryKey: ["/api/admin/payments"] });
  const { data: users = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  const eligibleUsers = users.filter((u) => u.role !== "ADMIN" && u.status === "ACTIVE");

  const createMut = useMutation({
    mutationFn: (data: { userId: string; amount: number; label: string; date?: string }) =>
      apiRequest("POST", "/api/admin/payments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDialogOpen(false);
      setFormData({ userId: "", amount: "", label: "", date: new Date().toISOString().split("T")[0] });
      toast({ title: "Paiement enregistré", description: "L'abonnement a été activé." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'enregistrer le paiement", variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.userId || !formData.amount || !formData.label) return;
    createMut.mutate({
      userId: formData.userId,
      amount: parseFloat(formData.amount),
      label: formData.label,
      date: formData.date || undefined,
    });
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button
          className="bg-[#dc4256] hover:bg-[#c53a4d] text-white"
          onClick={() => setDialogOpen(true)}
          data-testid="btn-new-payment"
        >
          <CreditCard className="w-4 h-4 mr-1" />
          Enregistrer un paiement
        </Button>
      </div>

      {payments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Aucun paiement enregistré
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-payments">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4">Utilisateur</th>
                <th className="py-2 pr-4">Montant</th>
                <th className="py-2 pr-4">Libellé</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2">Abonnement</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0" data-testid={`row-payment-${p.id}`}>
                  <td className="py-3 pr-4 font-medium">{p.user.firstName} {p.user.lastName}</td>
                  <td className="py-3 pr-4">{p.amount.toFixed(2)} €</td>
                  <td className="py-3 pr-4">{p.label}</td>
                  <td className="py-3 pr-4">{formatDate(p.date)}</td>
                  <td className="py-3">
                    <Badge className={p.user.subscriptionActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>
                      {p.user.subscriptionActive ? "Actif" : "Inactif"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enregistrer un paiement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Utilisateur *</Label>
              <Select value={formData.userId} onValueChange={(v) => setFormData({ ...formData, userId: v })}>
                <SelectTrigger data-testid="select-payment-user">
                  <SelectValue placeholder="Sélectionner un utilisateur" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="payment-amount">Montant (€) *</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                data-testid="input-payment-amount"
              />
            </div>
            <div>
              <Label htmlFor="payment-label">Libellé *</Label>
              <Input
                id="payment-label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Ex: Abonnement mensuel mars 2026"
                required
                data-testid="input-payment-label"
              />
            </div>
            <div>
              <Label htmlFor="payment-date">Date</Label>
              <Input
                id="payment-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                data-testid="input-payment-date"
              />
            </div>
            <DialogFooter>
              <Button type="submit" className="bg-[#dc4256] hover:bg-[#c53a4d]" disabled={createMut.isPending} data-testid="btn-submit-payment">
                {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== MON COMPTE ====================

function MonCompteTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const profileMut = useMutation({
    mutationFn: (data: { firstName?: string; lastName?: string; email?: string }) =>
      apiRequest("PATCH", "/api/auth/me", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Profil mis à jour" });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de mettre à jour le profil", variant: "destructive" }),
  });

  const passwordMut = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiRequest("PATCH", "/api/auth/me/password", data),
    onSuccess: () => {
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Mot de passe modifié" });
    },
    onError: async (err: any) => {
      const msg = err.message?.includes("400") ? "Mot de passe actuel incorrect" : "Erreur lors du changement de mot de passe";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profileData.firstName || !profileData.lastName || !profileData.email) return;
    profileMut.mutate(profileData);
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast({ title: "Erreur", description: "Le nouveau mot de passe doit faire au moins 6 caractères", variant: "destructive" });
      return;
    }
    passwordMut.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  }

  return (
    <div className="space-y-8 max-w-md">
      <div>
        <h3 className="text-lg font-semibold mb-4">Informations personnelles</h3>
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div>
            <Label htmlFor="account-firstname">Prénom</Label>
            <Input
              id="account-firstname"
              value={profileData.firstName}
              onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
              required
              data-testid="input-account-firstname"
            />
          </div>
          <div>
            <Label htmlFor="account-lastname">Nom</Label>
            <Input
              id="account-lastname"
              value={profileData.lastName}
              onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
              required
              data-testid="input-account-lastname"
            />
          </div>
          <div>
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={profileData.email}
              onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
              required
              data-testid="input-account-email"
            />
          </div>
          <Button type="submit" className="bg-[#dc4256] hover:bg-[#c53a4d]" disabled={profileMut.isPending} data-testid="btn-save-profile">
            {profileMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Enregistrer
          </Button>
        </form>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">Changer le mot de passe</h3>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <Label htmlFor="current-password">Mot de passe actuel</Label>
            <Input
              id="current-password"
              type="password"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              required
              data-testid="input-current-password"
            />
          </div>
          <div>
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              required
              data-testid="input-new-password"
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
            <Input
              id="confirm-password"
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              required
              data-testid="input-confirm-password"
            />
          </div>
          <Button type="submit" className="bg-[#dc4256] hover:bg-[#c53a4d]" disabled={passwordMut.isPending} data-testid="btn-change-password">
            {passwordMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Modifier le mot de passe
          </Button>
        </form>
      </div>
    </div>
  );
}

// ==================== CREER UN ADMIN ====================

function CreerAdminTab() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });

  const createMut = useMutation({
    mutationFn: (data: { email: string; password: string; firstName: string; lastName: string }) =>
      apiRequest("POST", "/api/admin/create-admin", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setFormData({ email: "", password: "", firstName: "", lastName: "" });
      toast({ title: "Compte admin créé avec succès" });
    },
    onError: async (err: any) => {
      const msg = err.message?.includes("409") ? "Cet email est déjà utilisé" : "Erreur lors de la création";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName) return;
    if (formData.password.length < 6) {
      toast({ title: "Erreur", description: "Le mot de passe doit faire au moins 6 caractères", variant: "destructive" });
      return;
    }
    createMut.mutate(formData);
  }

  return (
    <div className="max-w-md">
      <h3 className="text-lg font-semibold mb-4">Créer un compte administrateur</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="admin-firstname">Prénom</Label>
          <Input
            id="admin-firstname"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            required
            data-testid="input-admin-firstname"
          />
        </div>
        <div>
          <Label htmlFor="admin-lastname">Nom</Label>
          <Input
            id="admin-lastname"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            required
            data-testid="input-admin-lastname"
          />
        </div>
        <div>
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            data-testid="input-admin-email"
          />
        </div>
        <div>
          <Label htmlFor="admin-password">Mot de passe</Label>
          <Input
            id="admin-password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            data-testid="input-admin-password"
          />
        </div>
        <Button type="submit" className="bg-[#dc4256] hover:bg-[#c53a4d]" disabled={createMut.isPending} data-testid="btn-create-admin">
          {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          Créer le compte admin
        </Button>
      </form>
    </div>
  );
}

// ==================== MAIN ADMIN PAGE ====================

export default function Admin() {
  const [activeTab, setActiveTab] = useState<string>("utilisateurs");

  const { data: pendingMeetings = [] } = useQuery<RelationWithUsers[]>({
    queryKey: ["/api/admin/relations/pending-meeting"],
  });
  const { data: users = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });
  const pendingUsers = users.filter((u) => u.status === "PENDING_VALIDATION").length;

  function getTabCount(tabId: string): number {
    if (tabId === "cadrage") return pendingMeetings.length;
    if (tabId === "utilisateurs") return pendingUsers;
    return 0;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl md:text-3xl font-bold mb-6" data-testid="text-admin-title">Administration</h1>

      <div className="flex gap-1 mb-8 overflow-x-auto pb-2">
        {ADMIN_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const count = getTabCount(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                isActive ? "bg-[#dc4256] text-white" : "bg-white text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`tab-admin-${tab.id}`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {count > 0 && (
                <Badge className={`ml-1 text-[10px] px-1.5 py-0 ${isActive ? "bg-white text-[#dc4256]" : "bg-[#dc4256] text-white"}`}>
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "utilisateurs" && <UsersTab />}
      {activeTab === "relations" && <RelationsTab />}
      {activeTab === "rencontres" && <RencontresTab />}
      {activeTab === "cadrage" && <CadrageTab />}
      {activeTab === "paiements" && <PaiementsTab />}
      {activeTab === "notifications" && <NotificationsAdminTab />}
      {activeTab === "mon-compte" && <MonCompteTab />}
      {activeTab === "creer-admin" && <CreerAdminTab />}
    </div>
  );
}
