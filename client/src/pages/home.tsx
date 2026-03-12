import { useAuth, type AuthUser } from "@/hooks/use-auth";
import { getPhotoUrl } from "@/lib/photo-url";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/status-badge";
import { Calendar, MessageCircle, Mail, User, LayoutGrid, ChevronRight, ChevronLeft, Plus, Check, X, Pencil, Heart, Camera, Trash2, AlertTriangle, Star, Users, ClipboardCheck, Eye, EyeOff, List, GalleryHorizontalEnd, MapPin, Lock } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { updateProfileSchema, type UpdateProfileInput, changePasswordSchema, type ChangePasswordInput } from "@shared/schema";
import type { Relation, User as UserType, Intervention } from "@shared/schema";
import MessagesTab from "@/components/messages-tab";
import { useSSE } from "@/hooks/use-sse";
import { useUnreadMessageCount } from "@/hooks/use-unread-count";
import { usePushNotifications } from "@/hooks/use-push";

type RelationWithUsers = Relation & { senior: UserType; junior: UserType; interventions?: Intervention[] };
type MatchSuggestion = { user: UserType; commonCategories: string[]; isRecommended: boolean; isFavorite: boolean };

const ALL_TABS = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { id: "rencontres", label: "Mes rencontres", icon: Calendar },
  { id: "messages", label: "Messages", icon: Mail },
  { id: "demandes", label: "Trouver un profil", icon: MessageCircle },
  { id: "profil", label: "Profil", icon: User },
] as const;

type InterventionWithPartner = Intervention & { partnerName: string; relationId: string };

function useDashboardCounts(relations?: RelationWithUsers[], pendingFB?: Intervention[], user?: AuthUser | null) {
  const allRels = relations || [];
  const isJunior = user?.role === "JUNIOR";

  const pendingDemandes = allRels.filter((r) => {
    if (isJunior) return r.status === "PENDING" && r.juniorId === user?.id;
    return r.status === "PENDING";
  });

  const activeRelations = allRels.filter((r) => r.status === "ACTIVE" || r.status === "PENDING_FIRST_MEETING");

  const proposedInterventions: InterventionWithPartner[] = activeRelations.flatMap((r) => {
    const partner = r.seniorId === user?.id ? r.junior : r.senior;
    return (r.interventions || []).filter((i) => i.status === "PROPOSED").map((i) => ({
      ...i, partnerName: `${partner.firstName} ${partner.lastName}`, relationId: r.id,
    }));
  });

  const allUpcoming = activeRelations.flatMap((r) => {
    const partner = r.seniorId === user?.id ? r.junior : r.senior;
    return (r.interventions || []).filter((i) => i.status === "CONFIRMED" || i.status === "PROPOSED").map((i) => ({
      ...i, partnerName: `${partner.firstName} ${partner.lastName}`, relationId: r.id,
    }));
  }).sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  const nextIntervention = allUpcoming[0] || null;

  const feedbackCount = (pendingFB || []).length;

  return { pendingDemandes, activeRelations, proposedInterventions, nextIntervention, feedbackCount };
}

export default function Home() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [openRelationId, setOpenRelationId] = useState<string | null>(null);
  const isNotAdmin = user?.role !== "ADMIN";
  const tabs = user?.role === "ADMIN"
    ? ALL_TABS.filter((t) => t.id !== "profil" && t.id !== "messages")
    : user?.role === "JUNIOR"
    ? ALL_TABS.filter((t) => t.id !== "demandes")
    : ALL_TABS;
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const relation = params.get("relation");
    if (tab) setActiveTab(tab);
    if (relation) setOpenRelationId(relation);
    if (tab || relation) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useSSE(!!user);
  usePushNotifications(!!user);
  const unreadMessages = useUnreadMessageCount(isNotAdmin);

  const { data: relations, isLoading: relLoading } = useQuery<RelationWithUsers[]>({ queryKey: ["/api/relations"] });
  const { data: pendingFB } = useQuery<Intervention[]>({ queryKey: ["/api/interventions/pending-feedback"] });

  const counts = useDashboardCounts(relations, pendingFB, user);

  const getTabBadge = (tabId: string) => {
    if (tabId === "messages") return unreadMessages;
    if (tabId === "demandes") return counts.pendingDemandes.length;
    if (tabId === "rencontres" && user?.role === "JUNIOR") return counts.proposedInterventions.length;
    return 0;
  };

  const urgentAlerts: { message: string; tab: string }[] = [];
  if (user?.role === "JUNIOR" && counts.proposedInterventions.length > 0) {
    urgentAlerts.push({ message: `${counts.proposedInterventions.length} intervention${counts.proposedInterventions.length > 1 ? "s" : ""} à confirmer !`, tab: "rencontres" });
  }
  if (counts.feedbackCount > 0) {
    urgentAlerts.push({ message: `${counts.feedbackCount} feedback${counts.feedbackCount > 1 ? "s" : ""} à donner`, tab: "rencontres" });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {urgentAlerts.length > 0 && (
        <div className="space-y-2 mb-4">
          {urgentAlerts.map((alert, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(alert.tab)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-orange-50 border border-orange-200 text-left hover:bg-orange-100 transition-colors"
              data-testid={`alert-urgent-${i}`}
            >
              <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
              <span className="text-sm font-medium text-orange-800 flex-1">{alert.message}</span>
              <ChevronRight className="w-4 h-4 text-orange-400" />
            </button>
          ))}
        </div>
      )}

      <h1 className="text-2xl md:text-3xl font-bold mb-6" data-testid="text-mon-espace">Bonjour {user?.firstName}</h1>

      <div className="flex gap-1 mb-8 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const count = getTabBadge(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                isActive ? "bg-[#dc4256] text-white" : "bg-white text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`tab-${tab.id}`}
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

      {activeTab === "dashboard" && <DashboardTab counts={counts} isLoading={relLoading} user={user} onSwitchTab={setActiveTab} />}
      {activeTab === "rencontres" && <RencontresTab relations={relations} isLoading={relLoading} user={user} onOpenMessage={(relationId) => { setOpenRelationId(relationId); setActiveTab("messages"); }} />}
      {activeTab === "messages" && <MessagesTab user={user} openRelationId={openRelationId} />}
      {activeTab === "demandes" && <DemandesTab relations={relations} isLoading={relLoading} user={user} />}
      {activeTab === "profil" && <ProfilTab user={user} />}
    </div>
  );
}

type DashboardCounts = ReturnType<typeof useDashboardCounts>;

function DashboardCard({ icon: Icon, count, label, detail, onClick, highlight, testId }: {
  icon: any; count: number | string; label: string; detail?: string; onClick: () => void; highlight?: "orange" | "red" | "purple"; testId: string;
}) {
  const bgClass = highlight === "orange" ? "bg-orange-50 border-orange-200" : highlight === "red" ? "bg-red-50 border-red-200" : highlight === "purple" ? "bg-[#f3eaff] border-[#e8d7fe]" : "bg-white border-transparent";
  const iconColor = highlight === "orange" ? "text-orange-500" : highlight === "red" ? "text-[#dc4256]" : highlight === "purple" ? "text-[#8b5cf6]" : "text-muted-foreground";
  const countColor = highlight === "orange" ? "text-orange-700" : highlight === "red" ? "text-[#dc4256]" : highlight === "purple" ? "text-[#8b5cf6]" : "text-foreground";

  return (
    <button
      onClick={onClick}
      className={`${bgClass} border rounded-2xl shadow-sm p-3 flex flex-col items-center justify-center hover:shadow-md transition-shadow cursor-pointer text-center min-h-[120px]`}
      data-testid={testId}
    >
      <Icon className={`w-5 h-5 ${iconColor} mb-1`} />
      <span className={`text-2xl font-bold ${countColor} leading-tight`}>{count}</span>
      <span className="text-[11px] font-semibold text-muted-foreground mt-1 leading-tight">{label}</span>
      {detail && <span className="text-[10px] text-muted-foreground/80 mt-0.5 leading-tight line-clamp-2">{detail}</span>}
    </button>
  );
}

function DashboardTab({ counts, isLoading, user, onSwitchTab }: { counts: DashboardCounts; isLoading: boolean; user: AuthUser | null; onSwitchTab: (tab: string) => void }) {
  const isJunior = user?.role === "JUNIOR";

  if (isLoading) {
    return <div className="grid grid-cols-2 gap-3"><Skeleton className="h-[120px] rounded-2xl" /><Skeleton className="h-[120px] rounded-2xl" /><Skeleton className="h-[120px] rounded-2xl" /><Skeleton className="h-[120px] rounded-2xl" /></div>;
  }

  const nextDate = counts.nextIntervention
    ? new Date(counts.nextIntervention.scheduledDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
    : null;
  const nextPartner = counts.nextIntervention?.partnerName || null;
  const nextLocation = counts.nextIntervention?.location || null;
  const nextDetail = nextDate
    ? `${nextDate}${nextPartner ? `\navec ${nextPartner}` : ""}${nextLocation ? ` · ${nextLocation}` : ""}`
    : "Aucune prévue";

  const pendingPartners = counts.pendingDemandes.slice(0, 2).map((r) => {
    const partner = r.seniorId === user?.id ? r.junior : r.senior;
    return partner.firstName;
  });
  const pendingDetail = pendingPartners.length > 0
    ? pendingPartners.join(", ") + (counts.pendingDemandes.length > 2 ? "…" : "")
    : "Aucune";

  const proposedDetail = counts.proposedInterventions.length > 0
    ? counts.proposedInterventions.length === 1
      ? `de ${counts.proposedInterventions[0].partnerName}`
      : `${counts.proposedInterventions.length} propositions`
    : "Aucune";

  const activePartners = counts.activeRelations.slice(0, 2).map((r) => {
    const partner = r.seniorId === user?.id ? r.junior : r.senior;
    return partner.firstName;
  });
  const activeDetail = activePartners.length > 0
    ? activePartners.join(", ") + (counts.activeRelations.length > 2 ? "…" : "")
    : "Aucune";

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4" data-testid="text-resume">Résumé</h3>
      <div className="grid grid-cols-2 gap-3">
        {isJunior ? (
          <>
            <DashboardCard
              icon={ClipboardCheck}
              count={counts.proposedInterventions.length}
              label="À confirmer"
              detail={proposedDetail}
              onClick={() => onSwitchTab("rencontres")}
              highlight={counts.proposedInterventions.length > 0 ? "orange" : undefined}
              testId="card-a-confirmer"
            />
            <DashboardCard
              icon={MessageCircle}
              count={counts.pendingDemandes.length}
              label="Demandes reçues"
              detail={pendingDetail}
              onClick={() => onSwitchTab("demandes")}
              highlight={counts.pendingDemandes.length > 0 ? "red" : undefined}
              testId="card-demandes"
            />
          </>
        ) : (
          <>
            <DashboardCard
              icon={MessageCircle}
              count={counts.pendingDemandes.length}
              label="Demandes envoyées"
              detail={pendingDetail}
              onClick={() => onSwitchTab("demandes")}
              highlight={counts.pendingDemandes.length > 0 ? "purple" : undefined}
              testId="card-demandes"
            />
            <DashboardCard
              icon={Users}
              count={counts.activeRelations.length}
              label="Relations actives"
              detail={activeDetail}
              onClick={() => onSwitchTab("rencontres")}
              highlight="purple"
              testId="card-relations-actives"
            />
          </>
        )}
        <DashboardCard
          icon={Calendar}
          count={nextDate || "--"}
          label="Prochaine rencontre"
          detail={nextDetail}
          onClick={() => onSwitchTab("rencontres")}
          highlight="purple"
          testId="card-prochaine-rencontre"
        />
        <DashboardCard
          icon={Star}
          count={counts.feedbackCount}
          label="Feedback à donner"
          detail={counts.feedbackCount > 0 ? "Urgent" : "À jour"}
          onClick={() => onSwitchTab("rencontres")}
          highlight={counts.feedbackCount > 0 ? "orange" : undefined}
          testId="card-feedback"
        />
      </div>
    </div>
  );
}

function RencontresTab({ relations, isLoading, user, onOpenMessage }: { relations?: RelationWithUsers[]; isLoading: boolean; user: any; onOpenMessage: (relationId: string) => void }) {
  const [, setLocation] = useLocation();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>;

  const activeRelations = (relations || []).filter((r) => r.status === "ACTIVE" || r.status === "PENDING_FIRST_MEETING");

  if (activeRelations.length === 0) {
    return (
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <p>Aucune relation active pour le moment.</p>
          <p className="text-sm mt-1">Rendez-vous dans l'onglet Trouver un profil pour trouver votre partenaire.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {activeRelations.map((rel) => {
        const partner = rel.seniorId === user?.id ? rel.junior : rel.senior;
        const isExpanded = !collapsedIds.has(rel.id);
        const interventions = (rel.interventions || []).sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

        return (
          <Card key={rel.id} className="rounded-2xl border-0 shadow-sm overflow-hidden" data-testid={`card-relation-${rel.id}`}>
            <CardContent className="p-0">
              <div
                className="w-full flex items-center justify-between py-4 px-4"
                data-testid={`header-relation-${rel.id}`}
              >
                <div className="flex items-center gap-3">
                  <UserAvatar user={partner} />
                  <div>
                    <p className="font-medium text-sm">{partner.firstName} {partner.lastName}</p>
                    <p className="text-xs text-muted-foreground">{partner.city || "Ville non renseignée"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={rel.status} />
                  {rel.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      className="rounded-full text-xs bg-[#dc4256] hover:bg-[#c73848] text-white"
                      onClick={() => onOpenMessage(rel.id)}
                      data-testid={`button-message-${rel.id}`}
                    >
                      <Mail className="w-3 h-3 mr-1" /> Envoyer un message
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full text-xs"
                    onClick={() => setLocation(`/relations/${rel.id}`)}
                    data-testid={`button-voir-profil-${rel.id}`}
                  >
                    Voir son profil <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>

              {interventions.length === 0 && (
                <div className="border-t px-4 py-3">
                  <p className="text-xs text-muted-foreground text-center">Aucune rencontre planifiée</p>
                </div>
              )}

              {interventions.length > 0 && (
                <div>
                  <div className="border-t" />
                  <div className="pt-3 pb-4 pr-4" style={{ marginLeft: "10%" }}>
                    <div className="border-l-2 border-primary/20 pl-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Historique des rencontres</h4>
                        <Button
                          variant={isExpanded ? "outline" : "default"}
                          size="sm"
                          className="rounded-full text-xs gap-1.5"
                          aria-expanded={isExpanded}
                          onClick={() => {
                            setCollapsedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(rel.id)) {
                                next.delete(rel.id);
                              } else {
                                next.add(rel.id);
                              }
                              return next;
                            });
                          }}
                          data-testid={`toggle-history-${rel.id}`}
                        >
                          {isExpanded ? (
                            <><EyeOff className="w-3.5 h-3.5" /> Masquer l'historique</>
                          ) : (
                            <><Eye className="w-3.5 h-3.5" /> Voir l'historique ({interventions.length})</>
                          )}
                        </Button>
                      </div>

                      {isExpanded && (
                        <div className="space-y-2">
                          {interventions.map((interv) => (
                            <div
                              key={interv.id}
                              className="flex items-center justify-between py-2 px-3 rounded-xl bg-muted/30 text-sm"
                              data-testid={`intervention-${interv.id}`}
                            >
                              <div>
                                <p className="font-medium text-xs">
                                  {new Date(interv.scheduledDate).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {interv.durationMinutes} min{interv.location ? ` · ${interv.location}` : ""}
                                </p>
                              </div>
                              <StatusBadge status={interv.status} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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

function UserAvatar({ user, size = "sm" }: { user: { firstName: string; lastName: string; profilePhoto?: string | null }; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = { sm: "w-10 h-10 text-sm", md: "w-14 h-14 text-lg", lg: "w-16 h-16 text-xl" };
  if (user.profilePhoto) {
    return <img src={getPhotoUrl(user.profilePhoto)!} alt={`${user.firstName} ${user.lastName}`} className={`${sizeClasses[size]} rounded-full object-cover`} />;
  }
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-[#e8d7fe] flex items-center justify-center font-bold text-[#8b5cf6]`}>
      {user.firstName[0]}{user.lastName[0]}
    </div>
  );
}

function DemandesTab({ relations, isLoading, user }: { relations?: RelationWithUsers[]; isLoading: boolean; user: any }) {
  const { toast } = useToast();
  const isSenior = user?.role === "SENIOR";
  const [sugFilter, setSugFilter] = useState<"all" | "favorites" | "recommended">("all");
  const [viewMode, setViewMode] = useState<"list" | "carousel">("carousel");
  const [carouselIndex, setCarouselIndex] = useState(0);

  const { data: suggestions, isLoading: sugLoading } = useQuery<MatchSuggestion[]>({
    queryKey: ["/api/matching/suggestions"],
    enabled: isSenior,
  });

  const createRelationMutation = useMutation({
    mutationFn: async (juniorId: string) => {
      await apiRequest("POST", "/api/relations", { juniorId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matching/suggestions"] });
      toast({ title: "Demande envoyee", description: "Le jeune recevra votre demande." });
    },
    onError: (e: Error) => {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ juniorId, isFavorite }: { juniorId: string; isFavorite: boolean }) => {
      if (isFavorite) {
        await apiRequest("DELETE", `/api/favorites/${juniorId}`);
      } else {
        await apiRequest("POST", `/api/favorites/${juniorId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matching/suggestions"] });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/relations/${id}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations"] });
      toast({ title: "Demande acceptee !" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/relations/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/relations"] });
      toast({ title: "Demande refusee." });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-2xl" /></div>;

  const pendingRelations = (relations || []).filter((r) => r.status === "PENDING");

  const filteredSuggestions = (suggestions || []).filter((s) => {
    if (sugFilter === "favorites") return s.isFavorite;
    if (sugFilter === "recommended") return s.isRecommended;
    return true;
  });

  const safeCarouselIndex = Math.min(carouselIndex, Math.max(0, filteredSuggestions.length - 1));

  const filterButtons = [
    { id: "all" as const, label: "Tous" },
    { id: "favorites" as const, label: "Favoris" },
    { id: "recommended" as const, label: "Recommandés FEVES" },
  ];

  return (
    <div className="space-y-6">
      {isSenior && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Suggestions de matching</h3>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2 flex-wrap">
              {filterButtons.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSugFilter(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    sugFilter === f.id
                      ? "bg-[#dc4256] text-white"
                      : "bg-white text-muted-foreground hover:bg-muted border"
                  }`}
                  data-testid={`filter-suggestions-${f.id}`}
                >
                  {f.id === "favorites" && <Heart className="w-3 h-3 inline mr-1" />}
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 border rounded-lg p-0.5" data-testid="view-mode-toggle">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-[#dc4256] text-white" : "text-muted-foreground hover:bg-muted"}`}
                aria-label="Vue liste"
                aria-pressed={viewMode === "list"}
                data-testid="view-mode-list"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("carousel")}
                className={`p-1.5 rounded-md transition-colors ${viewMode === "carousel" ? "bg-[#dc4256] text-white" : "text-muted-foreground hover:bg-muted"}`}
                aria-label="Vue carrousel"
                aria-pressed={viewMode === "carousel"}
                data-testid="view-mode-carousel"
              >
                <GalleryHorizontalEnd className="w-4 h-4" />
              </button>
            </div>
          </div>
          {sugLoading ? (
            <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>
          ) : filteredSuggestions.length === 0 ? (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                {sugFilter === "favorites" ? "Aucun favori pour le moment." : sugFilter === "recommended" ? "Aucune recommandation FEVES pour le moment." : "Aucune suggestion disponible pour le moment."}
              </CardContent>
            </Card>
          ) : viewMode === "list" ? (
              <div className="space-y-3">
                {filteredSuggestions.map((s) => (
                  <Card
                    key={s.user.id}
                    className="rounded-2xl border-0 shadow-sm"
                    data-testid={`card-suggestion-${s.user.id}`}
                  >
                    <CardContent className="py-4 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <UserAvatar user={s.user} size="lg" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{s.user.firstName} {s.user.lastName}</p>
                            {s.isRecommended && <Badge className="bg-[#e8d7fe] text-[#8b5cf6] text-[10px] px-1.5">Recommandé</Badge>}
                          </div>
                          {s.user.city && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" />{s.user.city}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => toggleFavoriteMutation.mutate({ juniorId: s.user.id, isFavorite: s.isFavorite })}
                            disabled={toggleFavoriteMutation.isPending}
                            className="p-1.5 rounded-full hover:bg-muted transition-colors"
                            data-testid={`button-favorite-${s.user.id}`}
                            aria-label={s.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                          >
                            <Heart className={`w-5 h-5 transition-colors ${s.isFavorite ? "fill-[#dc4256] text-[#dc4256]" : "text-muted-foreground"}`} />
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-[10px] px-2 py-1 h-auto text-[#dc4256] hover:text-[#c73848] hover:bg-red-50"
                            onClick={() => createRelationMutation.mutate(s.user.id)}
                            disabled={createRelationMutation.isPending}
                            data-testid={`button-propose-${s.user.id}`}
                          >
                            <Plus className="w-3 h-3 mr-0.5" /> Proposer une rencontre
                          </Button>
                        </div>
                      </div>

                      {s.user.bio && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{s.user.bio}</p>
                      )}

                      {s.commonCategories.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          {s.commonCategories.map((c) => (
                            <Badge key={c} variant="outline" className="text-[10px] px-2 py-0.5 bg-[#f3eaff] border-[#e8d7fe]">{c}</Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="relative" data-testid="carousel-container">
                <div className="flex items-center justify-center py-4" style={{ minHeight: "480px" }}>
                  {filteredSuggestions.map((s, idx) => {
                    const offset = idx - safeCarouselIndex;
                    const isActive = offset === 0;
                    const isVisible = Math.abs(offset) <= 1;
                    if (!isVisible) return null;

                    return (
                      <Card
                        key={s.user.id}
                        className="rounded-2xl border-0 shadow-lg overflow-hidden absolute transition-all duration-300 ease-in-out"
                        style={{
                          width: isActive ? "300px" : "250px",
                          transform: `translateX(${offset * 220}px) scale(${isActive ? 1 : 0.85})`,
                          opacity: isActive ? 1 : 0.5,
                          zIndex: isActive ? 10 : 5,
                        }}
                        data-testid={`card-suggestion-${s.user.id}`}
                      >
                        <div className="relative w-full h-56 bg-muted">
                          {s.user.profilePhoto ? (
                            <img
                              src={getPhotoUrl(s.user.profilePhoto)!}
                              alt={`${s.user.firstName} ${s.user.lastName}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-[#e8d7fe] flex items-center justify-center">
                              <span className="text-4xl font-bold text-[#8b5cf6]">{s.user.firstName[0]}{s.user.lastName[0]}</span>
                            </div>
                          )}
                          <button
                            onClick={() => toggleFavoriteMutation.mutate({ juniorId: s.user.id, isFavorite: s.isFavorite })}
                            disabled={toggleFavoriteMutation.isPending}
                            className="absolute top-2 right-2 p-1.5 rounded-full bg-white/80 hover:bg-white transition-colors shadow-sm"
                            data-testid={`button-favorite-${s.user.id}`}
                            aria-label={s.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                          >
                            <Heart className={`w-4 h-4 transition-colors ${s.isFavorite ? "fill-[#dc4256] text-[#dc4256]" : "text-muted-foreground"}`} />
                          </button>
                          {s.isRecommended && (
                            <Badge className="absolute top-2 left-2 bg-[#e8d7fe] text-[#8b5cf6] text-[10px] px-1.5 shadow-sm">Recommandé</Badge>
                          )}
                        </div>
                        <CardContent className="p-3 flex flex-col gap-1.5">
                          <p className="font-semibold text-sm">{s.user.firstName} {s.user.lastName}</p>
                          {s.user.city && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{s.user.city}
                            </p>
                          )}
                          {s.user.bio && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{s.user.bio}</p>
                          )}
                          {s.commonCategories.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {s.commonCategories.map((c) => (
                                <Badge key={c} variant="outline" className="text-[9px] px-1.5 py-0 bg-[#f3eaff] border-[#e8d7fe]">{c}</Badge>
                              ))}
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-[10px] px-2 py-1 h-auto text-[#dc4256] hover:text-[#c73848] hover:bg-red-50 w-full mt-1"
                            onClick={() => createRelationMutation.mutate(s.user.id)}
                            disabled={createRelationMutation.isPending}
                            data-testid={`button-propose-${s.user.id}`}
                          >
                            <Plus className="w-3 h-3 mr-0.5" /> Proposer une rencontre
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {safeCarouselIndex > 0 && (
                  <button
                    onClick={() => setCarouselIndex((i) => Math.max(0, i - 1))}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/80 hover:bg-white shadow-md flex items-center justify-center transition-colors"
                    aria-label="Précédent"
                    data-testid="carousel-prev"
                  >
                    <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                  </button>
                )}
                {safeCarouselIndex < filteredSuggestions.length - 1 && (
                  <button
                    onClick={() => setCarouselIndex((i) => Math.min(filteredSuggestions.length - 1, i + 1))}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/80 hover:bg-white shadow-md flex items-center justify-center transition-colors"
                    aria-label="Suivant"
                    data-testid="carousel-next"
                  >
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                )}

                <div className="flex justify-center gap-1.5 mt-2" data-testid="carousel-dots">
                  {filteredSuggestions.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCarouselIndex(idx)}
                      className={`w-2 h-2 rounded-full transition-colors ${idx === safeCarouselIndex ? "bg-[#dc4256]" : "bg-muted-foreground/30"}`}
                      aria-label={`Voir profil ${idx + 1}`}
                      data-testid={`carousel-dot-${idx}`}
                    />
                  ))}
                </div>
              </div>
            )
          }
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          {isSenior ? "Demandes envoyees" : "Demandes recues"}
        </h3>
        {pendingRelations.length === 0 ? (
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              Aucune demande en attente.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingRelations.map((rel) => {
              const partner = rel.seniorId === user?.id ? rel.junior : rel.senior;
              const isJuniorTarget = rel.juniorId === user?.id;

              return (
                <Card key={rel.id} className="rounded-2xl border-0 shadow-sm" data-testid={`card-demande-${rel.id}`}>
                  <CardContent className="py-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <UserAvatar user={partner} size="lg" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{partner.firstName} {partner.lastName}</p>
                          <StatusBadge status={partner.role} />
                        </div>
                        {partner.city && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />{partner.city}
                          </p>
                        )}
                      </div>
                      {!isJuniorTarget && (
                        <Badge className="bg-amber-100 text-amber-800 text-xs flex-shrink-0">En attente</Badge>
                      )}
                    </div>

                    {partner.bio && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{partner.bio}</p>
                    )}

                    {isJuniorTarget && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs flex-1"
                          onClick={() => acceptMutation.mutate(rel.id)}
                          disabled={acceptMutation.isPending}
                          data-testid={`button-accept-${rel.id}`}
                        >
                          <Check className="w-3 h-3 mr-1" /> Accepter
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full text-xs flex-1"
                          onClick={() => rejectMutation.mutate(rel.id)}
                          disabled={rejectMutation.isPending}
                          data-testid={`button-reject-${rel.id}`}
                        >
                          <X className="w-3 h-3 mr-1" /> Refuser
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2 border-b border-border/50">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-right max-w-[60%] ${!value ? "text-muted-foreground/50 italic" : ""}`}>
        {value || "Non renseigne"}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{children}</h4>;
}

function PhotoUpload({ user }: { user: AuthUser }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/auth/me/photo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Erreur upload");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Photo mise à jour !" });
    },
    onError: (e: Error) => {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/auth/me/photo");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Photo supprimée" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  };

  return (
    <div className="relative group">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-photo-upload"
      />
      {user.profilePhoto ? (
        <div className="relative">
          <img src={getPhotoUrl(user.profilePhoto)!} alt="Photo de profil" className="w-16 h-16 rounded-full object-cover" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 w-16 h-16 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            disabled={uploadMutation.isPending}
            data-testid="button-change-photo"
          >
            <Camera className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#dc4256] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={deleteMutation.isPending}
            data-testid="button-delete-photo"
            aria-label="Supprimer la photo"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-16 h-16 rounded-full bg-[#e8d7fe] flex items-center justify-center cursor-pointer hover:bg-[#dac8f0] transition-colors"
          disabled={uploadMutation.isPending}
          data-testid="button-add-photo"
        >
          {uploadMutation.isPending ? (
            <span className="text-xs text-[#8b5cf6]">...</span>
          ) : (
            <Camera className="w-6 h-6 text-[#8b5cf6]" />
          )}
        </button>
      )}
    </div>
  );
}

function ProfilTab({ user }: { user: AuthUser | null }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/login");
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="py-6">
          <SectionTitle>Identite</SectionTitle>
          <div className="flex items-center gap-4 mb-4">
            <PhotoUpload user={user} />
            <div>
              <h3 className="text-lg font-bold" data-testid="text-profile-name">{user.firstName} {user.lastName}</h3>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={user.role} />
                <StatusBadge status={user.status} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="py-6">
          <SectionTitle>Contact</SectionTitle>
          <div className="space-y-1 text-sm">
            <ProfileField label="Email" value={user.email} />
            <ProfileField label="Telephone" value={user.phone} />
            <ProfileField label="Adresse" value={user.address} />
            <ProfileField label="Ville" value={user.city} />
            <ProfileField label="Code postal" value={user.postalCode} />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="py-6">
          <SectionTitle>Profil</SectionTitle>
          <div className="space-y-1 text-sm">
            <ProfileField label="Bio" value={user.bio} />
            <ProfileField label="Activite souhaitee" value={user.desiredActivity} />
          </div>
        </CardContent>
      </Card>

      {(user.role === "SENIOR" || user.role === "JUNIOR") && (
        <Card className="rounded-2xl border-0 shadow-sm bg-[#f3eaff]">
          <CardContent className="py-6">
            {user.role === "SENIOR" ? (
              <>
                <SectionTitle>Personne de confiance</SectionTitle>
                <div className="space-y-1 text-sm">
                  <ProfileField label="Nom" value={user.trustedPersonName} />
                  <ProfileField label="Email" value={user.trustedPersonEmail} />
                </div>
              </>
            ) : (
              <>
                <SectionTitle>Referent & Ecole</SectionTitle>
                <div className="space-y-1 text-sm">
                  <ProfileField label="Titre" value={user.referentTitle} />
                  <ProfileField label="Nom" value={user.referentLastName} />
                  <ProfileField label="Email" value={user.referentEmail} />
                  <Separator className="my-3" />
                  <ProfileField label="Ecole" value={user.schoolName} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <ChangePasswordSection />

      <EditProfileDialog user={user} open={editOpen} onOpenChange={setEditOpen} />

      <Button
        onClick={() => setEditOpen(true)}
        variant="outline"
        className="w-full rounded-full border-[#dc4256] text-[#dc4256] hover:bg-[#dc4256] hover:text-white"
        data-testid="button-edit-profile"
      >
        <Pencil className="w-4 h-4 mr-2" /> Modifier mon profil
      </Button>

      <Button
        onClick={handleLogout}
        className="w-full rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white"
        data-testid="button-logout-profil"
      >
        Deconnexion
      </Button>
    </div>
  );
}

function ChangePasswordSection() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: ChangePasswordInput) => {
      await apiRequest("PATCH", "/api/auth/me/password", data);
    },
    onSuccess: () => {
      toast({ title: "Mot de passe modifié avec succès" });
      form.reset();
      setOpen(false);
    },
    onError: (error: Error) => {
      const msg = error.message.includes("400")
        ? "Mot de passe actuel incorrect"
        : "Erreur lors du changement de mot de passe";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="py-6">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 w-full text-left"
          data-testid="button-toggle-password"
        >
          <Lock className="w-4 h-4 text-[#dc4256]" />
          <SectionTitle>Modifier mon mot de passe</SectionTitle>
          <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        {open && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4 mt-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mot de passe actuel</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Votre mot de passe actuel" {...field} data-testid="input-current-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nouveau mot de passe</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Min. 6 caractères" {...field} data-testid="input-new-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="w-full rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white"
                data-testid="button-submit-password"
              >
                {mutation.isPending ? "Modification en cours..." : "Valider"}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}

function EditProfileDialog({ user, open, onOpenChange }: { user: AuthUser; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      address: user.address || "",
      city: user.city || "",
      postalCode: user.postalCode || "",
      bio: user.bio || "",
      desiredActivity: user.desiredActivity || "",
      trustedPersonName: user.trustedPersonName || "",
      trustedPersonEmail: user.trustedPersonEmail || "",
      schoolName: user.schoolName || "",
      referentTitle: user.referentTitle || "",
      referentFirstName: user.referentFirstName || "",
      referentLastName: user.referentLastName || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateProfileInput) => {
      const res = await apiRequest("PATCH", "/api/auth/me", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Profil mis a jour !" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible de mettre a jour le profil.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier mon profil</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
            <div>
              <SectionTitle>Identite</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prenom</FormLabel>
                    <FormControl><Input {...field} data-testid="input-edit-firstName" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl><Input {...field} data-testid="input-edit-lastName" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            <Separator />

            <div>
              <SectionTitle>Contact</SectionTitle>
              <div className="space-y-3">
                <div>
                  <Label className="text-muted-foreground text-xs">Email (non modifiable)</Label>
                  <Input value={user.email} disabled className="mt-1 bg-muted/30" />
                </div>
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telephone</FormLabel>
                    <FormControl><Input {...field} data-testid="input-edit-phone" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adresse</FormLabel>
                    <FormControl><Input {...field} data-testid="input-edit-address" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ville</FormLabel>
                      <FormControl><Input {...field} data-testid="input-edit-city" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="postalCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code postal</FormLabel>
                      <FormControl><Input {...field} data-testid="input-edit-postalCode" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <SectionTitle>Profil</SectionTitle>
              <div className="space-y-3">
                <FormField control={form.control} name="bio" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl><Textarea {...field} rows={3} placeholder="Parlez de vous..." data-testid="input-edit-bio" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="desiredActivity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Activite souhaitee</FormLabel>
                    <FormControl><Input {...field} placeholder="Ex: Jardinage, Lecture..." data-testid="input-edit-desiredActivity" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {user.role === "SENIOR" && (
              <>
                <Separator />
                <div className="bg-[#f3eaff] rounded-xl p-4 -mx-2">
                  <SectionTitle>Personne de confiance</SectionTitle>
                  <div className="space-y-3">
                    <FormField control={form.control} name="trustedPersonName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom</FormLabel>
                        <FormControl><Input {...field} data-testid="input-edit-trustedPersonName" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="trustedPersonEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input {...field} type="email" data-testid="input-edit-trustedPersonEmail" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              </>
            )}

            {user.role === "JUNIOR" && (
              <>
                <Separator />
                <div className="bg-[#f3eaff] rounded-xl p-4 -mx-2">
                  <SectionTitle>Referent & Ecole</SectionTitle>
                  <div className="space-y-3">
                    <FormField control={form.control} name="referentTitle" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Titre</FormLabel>
                        <FormControl><Input {...field} placeholder="Ex: Professeur, Directeur..." data-testid="input-edit-referentTitle" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="referentFirstName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prenom</FormLabel>
                          <FormControl><Input {...field} data-testid="input-edit-referentFirstName" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="referentLastName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nom</FormLabel>
                          <FormControl><Input {...field} data-testid="input-edit-referentLastName" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <Separator className="my-2" />
                    <FormField control={form.control} name="schoolName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ecole</FormLabel>
                        <FormControl><Input {...field} data-testid="input-edit-schoolName" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              </>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white"
                data-testid="button-save-profile"
              >
                {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
