import { useAuth, type AuthUser } from "@/hooks/use-auth";
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
import { Calendar, MessageCircle, User, LayoutGrid, ChevronRight, Plus, Check, X, Pencil } from "lucide-react";
import { useState } from "react";
import { updateProfileSchema, type UpdateProfileInput } from "@shared/schema";
import type { Relation, User as UserType, Intervention } from "@shared/schema";

type RelationWithUsers = Relation & { senior: UserType; junior: UserType; interventions?: Intervention[] };
type MatchSuggestion = { user: UserType; commonCategories: string[]; isRecommended: boolean };

const ALL_TABS = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { id: "rencontres", label: "Rencontres", icon: Calendar },
  { id: "demandes", label: "Demandes", icon: MessageCircle },
  { id: "profil", label: "Profil", icon: User },
] as const;

export default function Home() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const tabs = user?.role === "ADMIN" ? ALL_TABS.filter((t) => t.id !== "profil") : ALL_TABS;
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
        {tabs.map((tab) => {
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
            <div className="w-16 h-16 rounded-full bg-[#e8d7fe] flex items-center justify-center text-xl font-bold text-[#8b5cf6]">
              {user.firstName[0]}{user.lastName[0]}
            </div>
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
                  <ProfileField label="Prenom" value={user.referentFirstName} />
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
