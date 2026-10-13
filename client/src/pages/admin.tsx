import { useEffect, useState } from "react";
import { getPhotoUrl } from "@/lib/photo-url";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import StarRating from "@/components/star-rating";
import { MobileTabsMenu } from "@/components/mobile-tabs-menu";
import MeetingHistory from "@/components/meeting-history";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
  X,
  ChevronsUpDown,
  Download,
  MessageSquare,
  Flag,
  RefreshCw,
  AlertTriangle,
  CheckCheck,
  GraduationCap,
  ThumbsUp,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { User, Relation, Intervention, PaymentRecord, Notification } from "@shared/schema";
import { ATELIERS } from "@shared/ateliers";
import { isMeetingEnded } from "@shared/meeting-check";
import { creditOwnerId, type CreditBalanceResponse } from "@shared/credits";
import { CREDIT_OFFERS } from "@shared/credit-offers";
import MessagerieAdminTab from "@/components/admin-messages-tab";
import SatisfactionTab from "@/components/admin-satisfaction-tab";
import { fmtTime, fmtDayLongMonthYear, gpParts } from "@/lib/availability-format";

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
  { id: "messagerie", label: "Messagerie", icon: MessageSquare },
  { id: "paiements", label: "Paiements", icon: CreditCard },
  { id: "signalements", label: "Signalements", icon: Flag },
  { id: "satisfaction", label: "Satisfaction", icon: ThumbsUp },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "mon-compte", label: "Mon compte", icon: UserCog },
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
  REFERENT_SENIOR: "bg-violet-100 text-violet-800",
  TEACHER: "bg-green-100 text-green-800",
};

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ==================== COMBOBOX UTILISATEURS ====================

function UserCombobox({
  users,
  selectedUserId,
  onSelect,
  placeholder = "Filtrer par utilisateur...",
  testId = "combobox-user",
}: {
  users: SafeUser[];
  selectedUserId: string | null;
  onSelect: (userId: string | null) => void;
  placeholder?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = users.find((u) => u.id === selectedUserId);

  return (
    <div className="flex gap-2 mb-4 items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            data-testid={testId}
          >
            {selected ? (
              <span className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate">{selected.firstName} {selected.lastName}</span>
                <Badge className={`${ROLE_COLORS[selected.role] || ""} text-[10px] px-1.5 py-0`}>{selected.role}</Badge>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Search className="w-4 h-4 shrink-0" />
                {placeholder}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Rechercher un utilisateur..." data-testid={`${testId}-search`} />
            <CommandList>
              <CommandEmpty>Aucun utilisateur trouvé</CommandEmpty>
              <CommandGroup>
                {users.map((u) => (
                  <CommandItem
                    key={u.id}
                    value={`${u.firstName} ${u.lastName} ${u.email}`}
                    onSelect={() => {
                      onSelect(selectedUserId === u.id ? null : u.id);
                      setOpen(false);
                    }}
                    className={selectedUserId === u.id ? "bg-accent" : ""}
                    data-testid={`${testId}-item-${u.id}`}
                  >
                    <span className="flex-1 truncate">{u.firstName} {u.lastName}</span>
                    <Badge className={`${ROLE_COLORS[u.role] || ""} text-[10px] px-1.5 py-0`}>{u.role}</Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedUserId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelect(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Effacer le filtre utilisateur"
              data-testid={`${testId}-clear`}
            >
              <X className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Effacer le filtre</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ==================== UTILISATEURS ====================

function UsersTab() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchUserId, setSearchUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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

  const filtered = users.filter((u) => {
    if (filter !== "all" && u.status !== filter) return false;
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (searchUserId && u.id !== searchUserId) return false;
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
    { id: "JUNIOR", label: "Jeunes" },
    { id: "TEACHER", label: "Profs" },
    { id: "ADMIN", label: "Admins" },
  ];

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Utilisateurs</h2>
        <Button size="sm" className="bg-[#dc4256] hover:bg-[#c53a4d]" onClick={() => setCreateOpen(true)} data-testid="button-create-user">
          <UserPlus className="w-4 h-4 mr-1" />
          Créer un utilisateur
        </Button>
      </div>

      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-amber-800 text-sm font-medium" data-testid="text-pending-count">
          {pendingCount} utilisateur{pendingCount > 1 ? "s" : ""} en attente de validation
        </div>
      )}

      <UserCombobox
        users={users}
        selectedUserId={searchUserId}
        onSelect={setSearchUserId}
        placeholder="Filtrer par utilisateur..."
        testId="combobox-users"
      />

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
                  <Tooltip>
                    <TooltipTrigger asChild>
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
                    </TooltipTrigger>
                    <TooltipContent>Valider le compte utilisateur</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
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
                    </TooltipTrigger>
                    <TooltipContent>Refuser l'inscription</TooltipContent>
                  </Tooltip>
                </>
              )}
              {u.status === "ACTIVE" && u.role !== "ADMIN" && (
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent>Suspendre le compte utilisateur</TooltipContent>
                </Tooltip>
              )}
              {u.role !== "ADMIN" && (
                <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" aria-label="Supprimer" data-testid={`btn-delete-${u.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Supprimer l'utilisateur</TooltipContent>
                  </Tooltip>
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Créer un utilisateur</DialogTitle>
          </DialogHeader>
          <CreerCompteTab />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== RELATIONS ====================

function AdvanceRelationButton({ relationId, seniorName, juniorName }: { relationId: string; seniorName: string; juniorName: string }) {
  const { toast } = useToast();
  const advanceMut = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/admin/relations/${relationId}/advance`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/relations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/relations/pending-meeting"] });
      toast({ title: "Relation avancée", description: "La relation est maintenant en attente de cadrage." });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid={`btn-advance-relation-${relationId}`}>
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Valider l'accord
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Le jeune a accepté verbalement — passer en cadrage</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Valider l'accord du jeune ?</AlertDialogTitle>
          <AlertDialogDescription>
            Vous confirmez que <strong>{juniorName}</strong> a accepté la demande de <strong>{seniorName}</strong> (accord verbal, téléphone, etc.). La relation passera en phase de cadrage pour organiser la 1ère rencontre.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => advanceMut.mutate()}
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={advanceMut.isPending}
          >
            Confirmer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RelationsTab() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState("all");
  const [searchUserId, setSearchUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: relations = [], isLoading } = useQuery<RelationWithUsers[]>({ queryKey: ["/api/admin/relations"] });
  const { data: allUsers = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

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

  const filtered = relations.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (searchUserId && r.seniorId !== searchUserId && r.juniorId !== searchUserId) return false;
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

  const pendingCount = relations.filter((r) => r.status === "PENDING").length;

  return (
    <div>
      {pendingCount > 0 && (
        <button
          onClick={() => setFilter("PENDING")}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-left hover:bg-amber-100 transition-colors mb-4"
          data-testid="banner-pending-relations"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <span className="text-sm font-semibold text-amber-800 flex-1">
            {pendingCount} nouvelle{pendingCount > 1 ? "s" : ""} demande{pendingCount > 1 ? "s" : ""} de relation en attente de traitement
          </span>
          <span className="text-xs text-amber-600 whitespace-nowrap">Voir →</span>
        </button>
      )}

      <UserCombobox
        users={allUsers}
        selectedUserId={searchUserId}
        onSelect={setSearchUserId}
        placeholder="Filtrer par utilisateur..."
        testId="combobox-relations"
      />

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
            {f.id === "PENDING" && pendingCount > 0 && (
              <span className="ml-1.5 bg-[#dc4256] text-white text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                {pendingCount}
              </span>
            )}
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
            {r.status === "PENDING" && (
              <AdvanceRelationButton relationId={r.id} seniorName={r.senior.firstName} juniorName={r.junior.firstName} />
            )}
            {r.status !== "CLOSED" && (
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent>Mettre fin à cette relation</TooltipContent>
                </Tooltip>
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
  const [searchUserId, setSearchUserId] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<RelationWithUsers | null>(null);
  const [formData, setFormData] = useState({
    scheduledDate: "",
    durationMinutes: 30,
    location: "",
    tasks: [] as string[],
  });

  function toggleTask(task: string) {
    setFormData((prev) => ({
      ...prev,
      tasks: prev.tasks.includes(task) ? prev.tasks.filter((t) => t !== task) : [...prev.tasks, task],
    }));
  }

  const { data: relations = [], isLoading } = useQuery<RelationWithUsers[]>({
    queryKey: ["/api/admin/relations/pending-meeting"],
  });
  const { data: allUsers = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  const createMut = useMutation({
    mutationFn: (data: { relationId: string; scheduledDate: string; durationMinutes: number; location?: string; tasks?: string[] }) =>
      apiRequest("POST", `/api/relations/${data.relationId}/interventions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/relations/pending-meeting"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/relations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/relations"] });
      setDialogOpen(false);
      setSelectedRelation(null);
      setFormData({ scheduledDate: "", durationMinutes: 30, location: "", tasks: [] });
      toast({ title: "1ère rencontre organisée" });
    },
    onError: (err) => {
      toast({ title: "Erreur", description: apiErrorMessage(err, "Impossible de créer l'intervention"), variant: "destructive" });
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
      tasks: formData.tasks,
    });
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const filteredRelations = relations.filter((r) => {
    if (searchUserId && r.seniorId !== searchUserId && r.juniorId !== searchUserId) return false;
    return true;
  });

  return (
    <div>
      <UserCombobox
        users={allUsers}
        selectedUserId={searchUserId}
        onSelect={setSearchUserId}
        placeholder="Filtrer par utilisateur..."
        testId="combobox-cadrage"
      />

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
                onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || 30 })}
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
              <Label>Prestation</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {ATELIERS.map((task) => {
                  const selected = formData.tasks.includes(task);
                  return (
                    <button
                      key={task}
                      type="button"
                      onClick={() => toggleTask(task)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
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
  const creditSeniorId = user ? creditOwnerId(user) : null;
  const { data: creditData } = useQuery<CreditBalanceResponse>({
    queryKey: ["/api/credits/balance", creditSeniorId],
    queryFn: () =>
      apiRequest("GET", `/api/credits/balance?seniorId=${encodeURIComponent(creditSeniorId!)}`).then((res) => res.json()),
    enabled: open && !!creditSeniorId,
  });

  if (!user) return null;

  const isTeacher = user.role === "TEACHER";

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
    { label: "École", value: user.schoolName, show: user.role === "JUNIOR" },
    { label: "Référent", value: user.referentTitle && user.referentFirstName && user.referentLastName ? `${user.referentTitle} ${user.referentFirstName} ${user.referentLastName}` : null, show: user.role === "JUNIOR" },
    { label: "Email référent", value: user.referentEmail, show: user.role === "JUNIOR" },
    { label: "Personne de confiance", value: user.trustedPersonName },
    { label: "Email personne de confiance", value: user.trustedPersonEmail },
    { label: "Solde de crédits", value: creditData ? `${creditData.balance} crédit(s), dont ${Math.max(creditData.available, 0)} disponible(s)` : null, show: !!creditSeniorId },
    { label: "Inscrit le", value: formatDate(user.createdAt) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {user.profilePhoto ? (
              <img src={getPhotoUrl(user.profilePhoto)!} alt={`${user.firstName} ${user.lastName}`} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#e8d7fe] flex items-center justify-center text-lg font-bold text-[#8b5cf6]">
                {user.firstName[0]}{user.lastName[0]}
              </div>
            )}
            <span>{user.firstName} {user.lastName}</span>
          </DialogTitle>
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
        {creditData && creditData.balance < 0 && (
          <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-4" data-testid="alert-negative-credit-balance">
            Solde de crédits négatif — un rattrapage est nécessaire.
          </p>
        )}
        {isTeacher && open && <TeacherPanel teacher={user} />}
      </DialogContent>
    </Dialog>
  );
}

function TeacherPanel({ teacher }: { teacher: SafeUser }) {
  const { toast } = useToast();
  const [assignStudentId, setAssignStudentId] = useState("");

  const { data: allUsers = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });
  const juniors = allUsers.filter((u) => u.role === "JUNIOR" && u.status === "ACTIVE");

  const { data: teacherStudents = [], refetch: refetchStudents } = useQuery<SafeUser[]>({
    queryKey: [`/api/admin/teachers/${teacher.id}/students`],
  });

  const { data: comments = [] } = useQuery<CommentWithUsers[]>({
    queryKey: ["/api/admin/teacher-comments"],
  });
  const teacherComments = comments.filter((c) => c.teacher.id === teacher.id);

  const assignMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/teachers/${teacher.id}/students`, { studentId: assignStudentId }),
    onSuccess: () => {
      refetchStudents();
      setAssignStudentId("");
      toast({ title: "Élève affilié" });
    },
    onError: async (err: any) => {
      let msg = "Erreur";
      try { const j = await err.response?.json?.(); msg = j?.message || msg; } catch {}
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  const unassignMut = useMutation({
    mutationFn: (studentId: string) =>
      apiRequest("DELETE", `/api/admin/teachers/${teacher.id}/students/${studentId}`),
    onSuccess: () => {
      refetchStudents();
      toast({ title: "Liaison supprimée" });
    },
  });

  return (
    <div className="mt-4 pt-4 border-t space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-2">Élèves affiliés</h4>
        <div className="flex gap-2 mb-3">
          <Select value={assignStudentId} onValueChange={setAssignStudentId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Choisir un élève..." />
            </SelectTrigger>
            <SelectContent>
              {juniors
                .filter((j) => !teacherStudents.some((s) => s.id === j.id))
                .map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.firstName} {j.lastName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 shrink-0"
            disabled={!assignStudentId || assignMut.isPending}
            onClick={() => assignMut.mutate()}
          >
            {assignMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Affilier"}
          </Button>
        </div>

        {teacherStudents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">Aucun élève affilié.</p>
        ) : (
          <div className="space-y-2">
            {teacherStudents.map((s: SafeUser) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded bg-muted/40">
                <div className="flex items-center gap-2">
                  <img src={getPhotoUrl(s.profilePhoto)} alt="" className="w-8 h-8 rounded-full object-cover" />
                  <div>
                    <p className="text-sm font-medium">{s.firstName} {s.lastName}</p>
                    {s.schoolName && <p className="text-xs text-muted-foreground">{s.schoolName}</p>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => unassignMut.mutate(s.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">Notes laissées par ce prof</h4>
        {teacherComments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">Aucune note.</p>
        ) : (
          <div className="space-y-2">
            {teacherComments.map((c) => (
              <div key={c.id} className="p-2 rounded bg-muted/40 text-sm space-y-1">
                <p>{c.content}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-teal-100 text-teal-800 text-xs">
                    Élève : {c.student.firstName} {c.student.lastName}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== RENCONTRES ====================

function RencontresTab() {
  const [searchUserId, setSearchUserId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: allUsers = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  const markDoneMutation = useMutation({
    mutationFn: async (interventionId: string) => {
      await apiRequest("PATCH", `/api/interventions/${interventionId}/done`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings/history"] });
      toast({ title: "Rencontre marquée comme réalisée" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (interventionId: string) => {
      await apiRequest("PATCH", `/api/interventions/${interventionId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings/history"] });
      toast({ title: "Rencontre annulée" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  return (
    <div>
      <div className="mb-4">
        <UserCombobox
          users={allUsers}
          selectedUserId={searchUserId}
          onSelect={setSearchUserId}
          placeholder="Filtrer par utilisateur..."
          testId="combobox-rencontres"
        />
      </div>

      <MeetingHistory
        key={searchUserId ?? "all"}
        scope={searchUserId ? { kind: "user", userId: searchUserId } : { kind: "me" }}
        viewerRole="ADMIN"
        emptyLabel="Aucune rencontre trouvée"
        renderActions={(entry) => {
          // Available as soon as the meeting has ended (e.g. after a phone
          // call), not only once the 24h reminder delay has passed.
          if (!isMeetingEnded(entry, new Date())) return null;
          return (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => markDoneMutation.mutate(entry.id)}
                disabled={markDoneMutation.isPending || entry.status !== "CONFIRMED"}
                data-testid={`button-admin-done-${entry.id}`}
                title={entry.status !== "CONFIRMED" ? "Doit d'abord être confirmée par le jeune" : undefined}
              >
                A-t-elle eu lieu ? Marquer réalisée
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelMutation.mutate(entry.id)}
                disabled={cancelMutation.isPending}
                data-testid={`button-admin-cancel-${entry.id}`}
              >
                Annuler
              </Button>
            </div>
          );
        }}
      />
    </div>
  );
}

// ==================== NOTIFICATIONS ADMIN ====================

const NOTIF_TYPE_COLORS: Record<string, string> = {
  RELATION_REQUEST: "bg-green-100 text-green-800",
  INTERVENTION_PROPOSED: "bg-blue-100 text-blue-800",
  INTERVENTION_CONFIRMED: "bg-indigo-100 text-indigo-800",
  FEEDBACK_REMINDER: "bg-amber-100 text-amber-800",
  MEETING_CHECK: "bg-red-100 text-red-800",
  SYSTEM: "bg-gray-100 text-gray-700",
};

const NOTIF_TYPE_LABELS: Record<string, string> = {
  RELATION_REQUEST: "Relation",
  INTERVENTION_PROPOSED: "Intervention proposée",
  INTERVENTION_CONFIRMED: "Intervention confirmée",
  FEEDBACK_REMINDER: "Rappel feedback",
  MEETING_CHECK: "Rencontre a-t-elle eu lieu ?",
  SYSTEM: "Système",
};

function NotificationsAdminTab() {
  const [searchUserId, setSearchUserId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<NotificationWithUser[]>({
    queryKey: ["/api/admin/notifications"],
  });
  const { data: allUsers = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  function openProfile(user: SafeUser) {
    setSelectedUser(user);
    setProfileOpen(true);
  }

  const types = Array.from(new Set(notifications.map((n) => n.type)));
  const filtered = notifications.filter((n) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (searchUserId && n.userId !== searchUserId) return false;
    return true;
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <UserCombobox
        users={allUsers}
        selectedUserId={searchUserId}
        onSelect={setSearchUserId}
        placeholder="Filtrer par utilisateur..."
        testId="combobox-notifications"
      />

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
    credits: "",
  });

  const { data: payments = [], isLoading } = useQuery<PaymentWithUser[]>({ queryKey: ["/api/admin/payments"] });
  const { data: users = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });

  const eligibleUsers = users.filter((u) => u.role !== "ADMIN" && u.status === "ACTIVE");

  const createMut = useMutation({
    mutationFn: (data: { userId: string; amount: number; label: string; date?: string; credits?: number }) =>
      apiRequest("POST", "/api/admin/payments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDialogOpen(false);
      setFormData({ userId: "", amount: "", label: "", date: new Date().toISOString().split("T")[0], credits: "" });
      toast({ title: "Paiement enregistré" });
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
      credits: formData.credits ? parseInt(formData.credits, 10) : undefined,
    });
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="rounded-2xl border bg-muted/30 p-4 mb-6" data-testid="section-credit-offers">
        <p className="text-sm font-semibold mb-1">Offres de crédits en ligne (Stripe)</p>
        <p className="text-xs text-muted-foreground mb-3">
          Lecture seule — ces prix sont fixés dans le code (<code>shared/credit-offers.ts</code>),
          pas modifiables depuis cet écran. Changer un montant nécessite un déploiement.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CREDIT_OFFERS.map((offer) => (
            <div key={offer.id} className="rounded-xl border bg-background px-4 py-3" data-testid={`row-offer-${offer.id}`}>
              <p className="text-sm font-medium">{offer.name} — {offer.label}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {offer.credits} crédit{offer.credits > 1 ? "s" : ""} — {offer.priceEuros} €
              </p>
            </div>
          ))}
        </div>
      </div>

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
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0" data-testid={`row-payment-${p.id}`}>
                  <td className="py-3 pr-4 font-medium">{p.user.firstName} {p.user.lastName}</td>
                  <td className="py-3 pr-4">{p.amount.toFixed(2)} €</td>
                  <td className="py-3 pr-4">{p.label}</td>
                  <td className="py-3">{formatDate(p.date)}</td>
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
                placeholder="Ex: Pack de 5 ateliers — virement"
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
            <div>
              <Label htmlFor="payment-credits">Crédits accordés (ateliers)</Label>
              <Input
                id="payment-credits"
                type="number"
                step="1"
                min="1"
                value={formData.credits}
                onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                placeholder="Ex: 5 (laisser vide si aucun crédit)"
                data-testid="input-payment-credits"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Si l'utilisateur est un référent, les crédits sont attribués à son senior lié.
              </p>
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

const CREER_COMPTE_ROLES = [
  { id: "admin", label: "Admin" },
  { id: "referent", label: "Référent sénior" },
  { id: "professeur", label: "Professeur" },
] as const;

function CreerCompteTab() {
  const [role, setRole] = useState<(typeof CREER_COMPTE_ROLES)[number]["id"]>("admin");

  return (
    <div className="max-w-md">
      <div className="flex gap-1 mb-6 rounded-full bg-muted/50 p-1 w-fit">
        {CREER_COMPTE_ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRole(r.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              role === r.id ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`role-toggle-${r.id}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {role === "admin" && <CreerAdminForm />}
      {role === "referent" && <CreerReferentForm />}
      {role === "professeur" && <CreerProfesseurForm />}
    </div>
  );
}

function CreerAdminForm() {
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
    <>
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
    </>
  );
}

function CreerReferentForm() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
    linkedSeniorId: "",
  });

  const { data: seniors = [], isLoading: seniorsLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/seniors/active"],
    staleTime: 0,
  });

  const createMut = useMutation({
    mutationFn: (data: typeof formData) => apiRequest("POST", "/api/admin/referents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setFormData({ email: "", password: "", firstName: "", lastName: "", phone: "", linkedSeniorId: "" });
      toast({ title: "Compte référent créé avec succès" });
    },
    onError: async (err: any) => {
      const msg = err.message?.includes("409") ? "Cet email est déjà utilisé" : "Erreur lors de la création";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName || !formData.linkedSeniorId) return;
    if (formData.password.length < 6) {
      toast({ title: "Erreur", description: "Le mot de passe doit faire au moins 6 caractères", variant: "destructive" });
      return;
    }
    createMut.mutate(formData);
  }

  return (
    <>
      <p className="text-sm text-muted-foreground mb-4">
        Le référent peut suivre les demandes du sénior lié, demander des prestations et contacter l'équipe.
        Le compte est immédiatement actif, aucune validation par email n'est nécessaire.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="ref-senior">Sénior lié <span className="text-destructive">*</span></Label>
          <Select
            value={formData.linkedSeniorId}
            onValueChange={(v) => setFormData({ ...formData, linkedSeniorId: v })}
          >
            <SelectTrigger id="ref-senior" data-testid="select-ref-senior">
              <SelectValue placeholder={seniorsLoading ? "Chargement..." : "Choisir un sénior..."} />
            </SelectTrigger>
            <SelectContent>
              {seniors.filter((u) => u.role === "SENIOR").map((s) => (
                <SelectItem key={s.id} value={s.id} data-testid={`option-senior-${s.id}`}>
                  {s.firstName} {s.lastName} — {s.city || "sans ville"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ref-firstname">Prénom <span className="text-destructive">*</span></Label>
            <Input
              id="ref-firstname"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
              data-testid="input-ref-firstname"
            />
          </div>
          <div>
            <Label htmlFor="ref-lastname">Nom <span className="text-destructive">*</span></Label>
            <Input
              id="ref-lastname"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
              data-testid="input-ref-lastname"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="ref-email">Email <span className="text-destructive">*</span></Label>
          <Input
            id="ref-email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            data-testid="input-ref-email"
          />
        </div>
        <div>
          <Label htmlFor="ref-phone">Téléphone</Label>
          <Input
            id="ref-phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="0690..."
            data-testid="input-ref-phone"
          />
        </div>
        <div>
          <Label htmlFor="ref-password">Mot de passe <span className="text-destructive">*</span></Label>
          <Input
            id="ref-password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            data-testid="input-ref-password"
          />
        </div>
        <Button
          type="submit"
          className="bg-[#8b5cf6] hover:bg-[#7c3aed]"
          disabled={createMut.isPending || !formData.linkedSeniorId}
          data-testid="btn-create-referent"
        >
          {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserPlus className="w-4 h-4 mr-1" />}
          Créer le compte référent
        </Button>
      </form>
    </>
  );
}

// ==================== SIGNALEMENTS TAB ====================

type ReportWithUsers = {
  id: string;
  reason: string;
  message: string;
  status: string;
  handledNote: string | null;
  handledAt: string | null;
  createdAt: string;
  reporter: SafeUser;
  target: SafeUser | null;
};

const REPORT_REASON_LABELS: Record<string, string> = {
  PERSON: "Problème avec une personne",
  QUESTION: "Question sur l'application",
  OTHER: "Autre chose",
};

function SignalementsTab() {
  const [dialogReport, setDialogReport] = useState<ReportWithUsers | null>(null);
  const [note, setNote] = useState("");

  const { data: reports = [], isLoading, refetch } = useQuery<ReportWithUsers[]>({
    queryKey: ["/api/admin/reports"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const handleMut = useMutation({
    mutationFn: ({ id, handledNote }: { id: string; handledNote: string }) =>
      apiRequest("PATCH", `/api/admin/reports/${id}/handle`, { handledNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/count"] });
      setDialogReport(null);
      setNote("");
    },
  });

  function openDialog(r: ReportWithUsers) {
    setNote("");
    setDialogReport(r);
  }

  function confirmHandle() {
    if (!dialogReport || note.trim().length < 5) return;
    handleMut.mutate({ id: dialogReport.id, handledNote: note.trim() });
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const open = reports.filter((r) => r.status === "OPEN");
  const handled = reports.filter((r) => r.status !== "OPEN");
  const sorted = [...open, ...handled];

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Signalements</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" data-testid="text-open-reports-count">
              {open.length} ouvert{open.length !== 1 ? "s" : ""}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => refetch()} data-testid="button-refresh-reports">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">Aucun signalement pour le moment.</p>
        ) : (
          <div className="space-y-4">
            {sorted.map((r) => (
              <Card key={r.id} className={r.status !== "OPEN" ? "opacity-60" : ""} data-testid={`card-report-${r.id}`}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={r.status === "OPEN" ? "destructive" : "secondary"}>
                          {r.status === "OPEN" ? "Ouvert" : "Traité"}
                        </Badge>
                        <span className="text-sm font-medium">{REPORT_REASON_LABELS[r.reason] ?? r.reason}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        De : <strong>{r.reporter.firstName} {r.reporter.lastName}</strong>
                        {r.target && <> — Concernant : <strong>{r.target.firstName} {r.target.lastName}</strong></>}
                      </p>
                      {r.message && (
                        <p className="text-sm bg-gray-50 rounded-lg p-3 italic">"{r.message}"</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Reçu le {new Date(r.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                      {r.status !== "OPEN" && r.handledNote && (
                        <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-3 space-y-1" data-testid={`text-handled-note-${r.id}`}>
                          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Action réalisée</p>
                          <p className="text-sm text-green-900">{r.handledNote}</p>
                          {r.handledAt && (
                            <p className="text-xs text-green-600">
                              Traité le {new Date(r.handledAt).toLocaleDateString("fr-FR", {
                                day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                              })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    {r.status === "OPEN" && (
                      <Button
                        data-testid={`button-handle-report-${r.id}`}
                        size="sm"
                        variant="outline"
                        className="flex-shrink-0"
                        onClick={() => openDialog(r)}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Traiter
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!dialogReport} onOpenChange={(v) => { if (!v) { setDialogReport(null); setNote(""); } }}>
        <DialogContent className="max-w-lg" data-testid="dialog-handle-report">
          <DialogHeader>
            <DialogTitle>Traiter ce signalement</DialogTitle>
            <DialogDescription>
              Décrivez l'action que vous avez réalisée pour résoudre ce signalement. Ce commentaire sera conservé dans l'historique.
            </DialogDescription>
          </DialogHeader>

          {dialogReport && (
            <div className="rounded-lg border bg-gray-50 p-3 text-sm space-y-1">
              <p><span className="font-semibold">Type :</span> {REPORT_REASON_LABELS[dialogReport.reason] ?? dialogReport.reason}</p>
              <p><span className="font-semibold">De :</span> {dialogReport.reporter.firstName} {dialogReport.reporter.lastName}</p>
              {dialogReport.target && (
                <p><span className="font-semibold">Concernant :</span> {dialogReport.target.firstName} {dialogReport.target.lastName}</p>
              )}
              {dialogReport.message && (
                <p className="italic text-muted-foreground">"{dialogReport.message}"</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="handled-note" className="font-semibold">
              Action réalisée <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="handled-note"
              data-testid="input-handled-note"
              placeholder="Ex : J'ai contacté l'utilisateur par téléphone, la situation a été clarifiée. Le profil a été suspendu en attente de vérification."
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="resize-none"
            />
            {note.length > 0 && note.trim().length < 5 && (
              <p className="text-xs text-destructive">Veuillez saisir au moins 5 caractères.</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setDialogReport(null); setNote(""); }}
              data-testid="button-cancel-handle"
            >
              Annuler
            </Button>
            <Button
              onClick={confirmHandle}
              disabled={note.trim().length < 5 || handleMut.isPending}
              data-testid="button-confirm-handle"
            >
              {handleMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              Confirmer le traitement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type CommentWithUsers = { id: string; content: string; createdAt: string; updatedAt: string; teacher: SafeUser; student: SafeUser };

// ==================== CRÉER PROFESSEUR TAB ====================

function CreerProfesseurForm() {
  const { toast } = useToast();
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "", phone: "" });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/teachers", form),
    onSuccess: () => {
      setForm({ email: "", password: "", firstName: "", lastName: "", phone: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
      // The Users tab lists teachers from /api/admin/users.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Professeur créé", description: "Le compte professeur a été créé avec succès." });
    },
    onError: async (err: any) => {
      let msg = "Erreur lors de la création";
      try { const j = await err.response?.json?.(); msg = j?.message || msg; } catch {}
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Le compte sera actif immédiatement. Le professeur peut se connecter sur <code>/espace-professeur</code>.
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Prénom <span className="text-destructive">*</span></Label>
            <Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Nom <span className="text-destructive">*</span></Label>
            <Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Email <span className="text-destructive">*</span></Label>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Mot de passe <span className="text-destructive">*</span></Label>
          <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Téléphone</Label>
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="06 00 00 00 00" />
        </div>

        <Button
          className="bg-green-600 hover:bg-green-700 w-full"
          disabled={!form.email || !form.password || !form.firstName || !form.lastName || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserPlus className="w-4 h-4 mr-1" />}
          Créer le compte professeur
        </Button>
      </div>
    </div>
  );
}

// ==================== MAIN ADMIN PAGE ====================

export default function Admin() {
  const [activeTab, setActiveTabState] = useState<string>(
    () => sessionStorage.getItem("feves_admin_tab") ?? "utilisateurs"
  );

  function setActiveTab(tab: string) {
    setActiveTabState(tab);
    sessionStorage.setItem("feves_admin_tab", tab);
  }

  // ?tab=rencontres comes from the "Rencontres à clôturer" notification and
  // e-mail. Applied on every URL change (the page does not remount when the
  // admin is already on /admin), then removed so a reload keeps the last tab.
  const search = useSearch();
  useEffect(() => {
    const tab = new URLSearchParams(search).get("tab");
    if (!tab || !ADMIN_TABS.some((t) => t.id === tab)) return;
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [search]);

  const { data: pendingMeetings = [] } = useQuery<RelationWithUsers[]>({
    queryKey: ["/api/admin/relations/pending-meeting"],
  });
  const { data: allRelations = [] } = useQuery<RelationWithUsers[]>({
    queryKey: ["/api/admin/relations"],
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { data: users = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/admin/users"] });
  const { data: reportCount } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/reports/count"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const pendingUsers = users.filter((u) => u.status === "PENDING_VALIDATION").length;
  const pendingRelations = allRelations.filter((r) => r.status === "PENDING").length;

  function getTabCount(tabId: string): number {
    if (tabId === "cadrage") return pendingMeetings.length;
    if (tabId === "utilisateurs") return pendingUsers;
    if (tabId === "signalements") return reportCount?.count ?? 0;
    if (tabId === "relations") return pendingRelations;
    return 0;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl md:text-3xl font-bold mb-6" data-testid="text-admin-title">Administration</h1>

      <MobileTabsMenu tabs={ADMIN_TABS} activeTab={activeTab} onSelect={setActiveTab} getBadgeCount={getTabCount} />

      <div className="hidden md:flex gap-1 mb-8 overflow-x-auto pb-2">
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
      {activeTab === "messagerie" && <MessagerieAdminTab />}
      {activeTab === "paiements" && <PaiementsTab />}
      {activeTab === "signalements" && <SignalementsTab />}
      {activeTab === "satisfaction" && <SatisfactionTab />}
      {activeTab === "notifications" && <NotificationsAdminTab />}
      {activeTab === "mon-compte" && <MonCompteTab />}
    </div>
  );
}
