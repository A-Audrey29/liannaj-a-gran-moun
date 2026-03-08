import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/status-badge";
import { Calendar, MessageCircle, User, LayoutGrid, ChevronRight, Plus, Check, X } from "lucide-react";
import { useState } from "react";
import type { Relation, User as UserType, Intervention } from "@shared/schema";

type RelationWithUsers = Relation & { senior: UserType; junior: UserType; interventions?: Intervention[] };
type MatchSuggestion = { user: UserType; commonCategories: string[]; isRecommended: boolean };

const TABS = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { id: "rencontres", label: "Rencontres", icon: Calendar },
  { id: "demandes", label: "Demandes", icon: MessageCircle },
  { id: "profil", label: "Profil", icon: User },
] as const;

export default function Home() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const { toast } = useToast();

  const { data: relations, isLoading: relLoading } = useQuery<RelationWithUsers[]>({ queryKey: ["/api/relations"] });
  const { data: pendingFB } = useQuery<Intervention[]>({ queryKey: ["/api/interventions/pending-feedback"] });

  const pendingDemandes = (relations || []).filter((r) => {
    if (user?.role === "JUNIOR") return r.status === "PENDING" && r.juniorId !== user?.id ? false : r.status === "PENDING";
    return r.status === "PENDING";
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl md:text-3xl font-bold mb-6" data-testid="text-mon-espace">Mon espace</h1>

      <div className="flex gap-1 mb-8 overflow-x-auto pb-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const count = tab.id === "demandes" ? pendingDemandes.length : 0;
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

      {activeTab === "dashboard" && <DashboardTab relations={relations} pendingFB={pendingFB} isLoading={relLoading} user={user} onSwitchTab={setActiveTab} />}
      {activeTab === "rencontres" && <RencontresTab relations={relations} isLoading={relLoading} user={user} />}
      {activeTab === "demandes" && <DemandesTab relations={relations} isLoading={relLoading} user={user} />}
      {activeTab === "profil" && <ProfilTab user={user} />}
    </div>
  );
}

function DashboardTab({ relations, pendingFB, isLoading, user, onSwitchTab }: { relations?: RelationWithUsers[]; pendingFB?: Intervention[]; isLoading: boolean; user: any; onSwitchTab: (tab: string) => void }) {
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-20 rounded-2xl" /><Skeleton className="h-20 rounded-2xl" /></div>;
  }

  const activeRelations = (relations || []).filter((r) => r.status === "ACTIVE" || r.status === "PENDING_FIRST_MEETING");
  const pendingDemandes = (relations || []).filter((r) => r.status === "PENDING");
  const nextIntervention = activeRelations.flatMap((r) => (r.interventions || []).filter((i) => i.status === "CONFIRMED" || i.status === "PROPOSED")).sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0];

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4" data-testid="text-resume">RESUME</h3>

      <Card className="rounded-2xl mb-3 border-0 shadow-sm">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {nextIntervention
                ? `Prochaine rencontre le ${new Date(nextIntervention.scheduledDate).toLocaleDateString("fr-FR")}`
                : "Aucune rencontre prevue"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!nextIntervention && <span className="text-muted-foreground text-lg">--</span>}
            <button className="text-[#dc4256] text-sm font-medium flex items-center gap-1 hover:underline" onClick={() => onSwitchTab("rencontres")} data-testid="link-planifier">
              Planifier <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl mb-3 border-0 shadow-sm">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium">{pendingDemandes.length} demande{pendingDemandes.length !== 1 ? "s" : ""} en attente</span>
          </div>
          <div className="flex items-center gap-2">
            {pendingDemandes.length > 0 && (
              <Badge className="bg-[#dc4256]/10 text-[#dc4256] border-[#dc4256]/20 text-xs">A traiter</Badge>
            )}
            <button className="text-[#dc4256] text-sm font-medium flex items-center gap-1 hover:underline" onClick={() => onSwitchTab("demandes")} data-testid="link-voir-demandes">
              Voir <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </CardContent>
      </Card>

      {(pendingFB || []).length > 0 && (
        <Card className="rounded-2xl mb-3 border-0 shadow-sm bg-orange-50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <span className="text-lg">&#9733;</span>
              <span className="text-sm font-medium text-orange-800">{pendingFB!.length} feedback{pendingFB!.length > 1 ? "s" : ""} a donner</span>
            </div>
            <Badge className="bg-orange-200 text-orange-800 text-xs">Urgent</Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RencontresTab({ relations, isLoading, user }: { relations?: RelationWithUsers[]; isLoading: boolean; user: any }) {
  const [, setLocation] = useLocation();

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>;

  const activeRelations = (relations || []).filter((r) => r.status === "ACTIVE" || r.status === "PENDING_FIRST_MEETING");

  if (activeRelations.length === 0) {
    return (
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <p>Aucune relation active pour le moment.</p>
          <p className="text-sm mt-1">Rendez-vous dans l'onglet Demandes pour trouver votre partenaire.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {activeRelations.map((rel) => {
        const partner = rel.seniorId === user?.id ? rel.junior : rel.senior;
        return (
          <Card
            key={rel.id}
            className="rounded-2xl border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setLocation(`/relations/${rel.id}`)}
            data-testid={`card-relation-${rel.id}`}
          >
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#e8d7fe] flex items-center justify-center text-sm font-bold text-[#8b5cf6]">
                  {partner.firstName[0]}{partner.lastName[0]}
                </div>
                <div>
                  <p className="font-medium text-sm">{partner.firstName} {partner.lastName}</p>
                  <p className="text-xs text-muted-foreground">{partner.city || "Ville non renseignee"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={rel.status} />
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DemandesTab({ relations, isLoading, user }: { relations?: RelationWithUsers[]; isLoading: boolean; user: any }) {
  const { toast } = useToast();
  const isSenior = user?.role === "SENIOR";

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

  return (
    <div className="space-y-6">
      {isSenior && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Suggestions de matching</h3>
          {sugLoading ? (
            <div className="space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /></div>
          ) : (suggestions || []).length === 0 ? (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                Aucune suggestion disponible pour le moment.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(suggestions || []).map((s) => (
                <Card key={s.user.id} className="rounded-2xl border-0 shadow-sm" data-testid={`card-suggestion-${s.user.id}`}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#e8d7fe] flex items-center justify-center text-sm font-bold text-[#8b5cf6]">
                        {s.user.firstName[0]}{s.user.lastName[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{s.user.firstName} {s.user.lastName}</p>
                          {s.isRecommended && <Badge className="bg-[#e8d7fe] text-[#8b5cf6] text-[10px] px-1.5">Recommande</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{s.user.city || ""}</p>
                        {s.commonCategories.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {s.commonCategories.map((c) => (
                              <Badge key={c} variant="outline" className="text-[10px] px-1.5 py-0 bg-[#f3eaff]">{c}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white text-xs"
                      onClick={() => createRelationMutation.mutate(s.user.id)}
                      disabled={createRelationMutation.isPending}
                      data-testid={`button-propose-${s.user.id}`}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Proposer
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#e8d7fe] flex items-center justify-center text-sm font-bold text-[#8b5cf6]">
                        {partner.firstName[0]}{partner.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{partner.firstName} {partner.lastName}</p>
                        <p className="text-xs text-muted-foreground">{partner.city || ""} - <StatusBadge status={partner.role} /></p>
                      </div>
                    </div>
                    {isJuniorTarget ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
                          onClick={() => acceptMutation.mutate(rel.id)}
                          disabled={acceptMutation.isPending}
                          data-testid={`button-accept-${rel.id}`}
                        >
                          <Check className="w-3 h-3 mr-1" /> Accepter
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full text-xs"
                          onClick={() => rejectMutation.mutate(rel.id)}
                          disabled={rejectMutation.isPending}
                          data-testid={`button-reject-${rel.id}`}
                        >
                          <X className="w-3 h-3 mr-1" /> Refuser
                        </Button>
                      </div>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800 text-xs">En attente</Badge>
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

function ProfilTab({ user }: { user: any }) {
  const { data: categories } = useQuery<any[]>({ queryKey: ["/api/auth/me"] });
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-[#e8d7fe] flex items-center justify-center text-xl font-bold text-[#8b5cf6]">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div>
              <h3 className="text-lg font-bold">{user.firstName} {user.lastName}</h3>
              <StatusBadge status={user.role} />
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Statut</span>
              <StatusBadge status={user.status} />
            </div>
          </div>
        </CardContent>
      </Card>

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
