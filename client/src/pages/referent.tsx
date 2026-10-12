import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { getPhotoUrl } from "@/lib/photo-url";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { referentInterventionSchema, referentContactSchema, type ReferentInterventionInput, type ReferentContactInput } from "@shared/schema";
import type { User as UserType, Relation, Intervention } from "@shared/schema";
import { ATELIERS } from "@shared/ateliers";
import { LayoutGrid, Calendar, Plus, Mail, User, CheckCircle, Clock, Loader2, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useSSE } from "@/hooks/use-sse";
import { MobileTabsMenu } from "@/components/mobile-tabs-menu";
import MeetingHistory from "@/components/meeting-history";
import { fmtTime, fmtDayLongMonthYear } from "@/lib/availability-format";
import { CreditOffersCard } from "@/components/credit-offers-card";

type RelationWithUsers = Relation & { senior: UserType; junior: UserType; interventions?: Intervention[] };

const INTERVENTION_STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Proposée",
  CONFIRMED: "Confirmée",
  CANCELLED: "Annulée",
  DONE: "Réalisée",
  COMPLETED_PENDING_FEEDBACK: "Feedback attendu",
  COMPLETED: "Terminée",
};

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

const INTERVENTION_STATUS_COLORS: Record<string, string> = {
  PROPOSED: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  CANCELLED: "bg-gray-100 text-gray-600",
  DONE: "bg-green-100 text-green-800",
  COMPLETED_PENDING_FEEDBACK: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-green-100 text-green-800",
};

/** Rencontres : wall-clock Guadeloupe, jamais la timezone du navigateur. */
function formatDate(d: string | Date) {
  const date = new Date(d);
  return `${fmtDayLongMonthYear(date)} à ${fmtTime(date)}`;
}

const TABS = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { id: "suivi", label: "Suivi des prestations", icon: Calendar },
  { id: "prestation", label: "Demander une prestation", icon: Plus },
  { id: "contact", label: "Contacter l'équipe", icon: Mail },
  { id: "profil", label: "Mon compte", icon: User },
] as const;

type TabId = typeof TABS[number]["id"];

// ==================== DASHBOARD TAB ====================

function DashboardTab({ senior, relations }: { senior: UserType | null; relations: RelationWithUsers[] }) {
  const { data: creditData } = useQuery<{ balance: number }>({ queryKey: ["/api/credits/balance"] });
  const activeRelations = relations.filter((r) => r.status === "ACTIVE");
  const pendingRelations = relations.filter((r) => r.status === "PENDING" || r.status === "PENDING_FIRST_MEETING");

  const now = Date.now();
  const upcomingInterventions = activeRelations
    .flatMap((r) => (r.interventions || [])
      .filter((i) => i.status === "CONFIRMED" || i.status === "PROPOSED")
      .map((i) => ({ ...i, juniorName: `${r.junior.firstName} ${r.junior.lastName}` })))
    .filter((i) => new Date(i.scheduledDate).getTime() >= now)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  const next = upcomingInterventions[0] || null;

  return (
    <div className="space-y-6">
      {senior && (
        <Card data-testid="card-linked-senior">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <img
                src={getPhotoUrl(senior.profilePhoto)}
                alt={`${senior.firstName} ${senior.lastName}`}
                className="w-14 h-14 rounded-full object-cover"
              />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Sénior lié</p>
                <p className="text-lg font-bold" data-testid="text-senior-name">
                  {senior.firstName} {senior.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{senior.city || ""}</p>
              </div>
              {creditData && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#dc4256]" data-testid="text-credit-balance">
                    {creditData.balance}
                  </p>
                  <p className="text-xs text-muted-foreground">crédit{creditData.balance > 1 ? "s" : ""}</p>
                </div>
              )}
            </div>
            {creditData && creditData.balance <= 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-4">
                Le solde de crédits est épuisé. Achetez un nouveau pack ci-dessous.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {senior && creditData && <CreditOffersCard />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-3xl font-bold text-green-600">{activeRelations.length}</p>
            <p className="text-sm text-muted-foreground mt-1">Relation{activeRelations.length > 1 ? "s" : ""} active{activeRelations.length > 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-3xl font-bold text-amber-600">{pendingRelations.length}</p>
            <p className="text-sm text-muted-foreground mt-1">En attente</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-3xl font-bold text-blue-600">{upcomingInterventions.length}</p>
            <p className="text-sm text-muted-foreground mt-1">Prochaine{upcomingInterventions.length > 1 ? "s" : ""} rencontre{upcomingInterventions.length > 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {next && (
        <Card className="border-blue-200 bg-blue-50" data-testid="card-next-intervention">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-blue-900">Prochaine rencontre</p>
                <p className="text-sm text-blue-800 mt-1">{formatDate(next.scheduledDate)}</p>
                {next.location && <p className="text-sm text-blue-700">{next.location}</p>}
                <p className="text-sm text-muted-foreground mt-1">Avec {next.juniorName}</p>
                <Badge className={`mt-2 text-xs ${INTERVENTION_STATUS_COLORS[next.status] || ""}`}>
                  {INTERVENTION_STATUS_LABELS[next.status] || next.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {relations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aucune relation en cours pour ce sénior.</p>
        </div>
      )}
    </div>
  );
}

// ==================== SUIVI TAB ====================

function SuiviTab({ relations }: { relations: RelationWithUsers[] }) {
  const [, setLocation] = useLocation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (relations.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aucune relation pour ce sénior.</p>
        </div>
        <MeetingHistory
          scope={{ kind: "me" }}
          viewerRole="REFERENT_SENIOR"
          emptyLabel="Aucune rencontre pour le moment."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
      {relations.map((r) => {
        const isExpanded = expandedId === r.id;
        return (
          <Card key={r.id} data-testid={`card-relation-${r.id}`}>
            <CardContent className="pt-5">
              <button
                className="w-full text-left"
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                data-testid={`btn-toggle-relation-${r.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={getPhotoUrl(r.junior.profilePhoto)}
                      alt={`${r.junior.firstName} ${r.junior.lastName}`}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-medium">{r.junior.firstName} {r.junior.lastName}</p>
                      <p className="text-xs text-muted-foreground">{(r.interventions || []).length} intervention{(r.interventions || []).length > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${RELATION_STATUS_COLORS[r.status] || ""}`}>
                      {RELATION_STATUS_LABELS[r.status] || r.status}
                    </Badge>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  {r.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      className="w-full rounded-full text-xs bg-[#8b5cf6] hover:bg-[#7c3aed] text-white mb-2"
                      onClick={() => setLocation(`/relations/${r.id}`)}
                      data-testid={`button-proposer-rencontre-${r.id}`}
                    >
                      Proposer une rencontre à {r.junior.firstName}
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground text-center py-1">
                    Le détail des rencontres est dans l'historique ci-dessous.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Historique des rencontres
        </h3>
        <MeetingHistory
          scope={{ kind: "me" }}
          viewerRole="REFERENT_SENIOR"
          emptyLabel="Aucune rencontre pour le moment."
        />
      </div>
    </div>
  );
}

// ==================== DEMANDER PRESTATION TAB ====================

const TASK_OPTIONS = ATELIERS;

function PrestationTab({ relations }: { relations: RelationWithUsers[] }) {
  const { toast } = useToast();
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  const activeRelations = relations.filter((r) => r.status === "ACTIVE");

  const form = useForm<ReferentInterventionInput>({
    resolver: zodResolver(referentInterventionSchema),
    defaultValues: {
      relationId: "",
      scheduledDate: "",
      durationMinutes: 120,
      location: "",
      tasks: [],
    },
  });

  const createMut = useMutation({
    mutationFn: (data: ReferentInterventionInput) =>
      apiRequest("POST", "/api/referent/interventions", { ...data, tasks: selectedTasks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referent/relations"] });
      form.reset();
      setSelectedTasks([]);
      toast({ title: "Prestation demandée", description: "La demande a été transmise au jeune." });
    },
    onError: async (err: any) => {
      let msg = "Erreur lors de la demande";
      try { const j = await err.response?.json?.(); msg = j?.message || msg; } catch {}
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  function toggleTask(task: string) {
    setSelectedTasks((prev) => prev.includes(task) ? prev.filter((t) => t !== task) : [...prev, task]);
  }

  if (activeRelations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Plus className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Aucune relation active. Les prestations ne peuvent être demandées que pour des relations actives.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h3 className="text-base font-semibold mb-1">Nouvelle demande de prestation</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Vous pouvez demander une intervention au nom du sénior lié. Le jeune recevra une notification et devra confirmer.
      </p>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((data) => createMut.mutate(data))}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="relationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Relation concernée <span className="text-destructive">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-relation">
                      <SelectValue placeholder="Choisir une relation active..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {activeRelations.map((r) => (
                      <SelectItem key={r.id} value={r.id} data-testid={`option-relation-${r.id}`}>
                        {r.junior.firstName} {r.junior.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="scheduledDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date proposée <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input type="datetime-local" {...field} data-testid="input-scheduled-date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="durationMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Durée</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(Number(v))}
                  value={String(field.value)}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-duration">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="60">1 heure</SelectItem>
                    <SelectItem value="90">1h30</SelectItem>
                    <SelectItem value="120">2 heures</SelectItem>
                    <SelectItem value="180">3 heures</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lieu</FormLabel>
                <FormControl>
                  <Input placeholder="Domicile du sénior, parc, etc." {...field} data-testid="input-location" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div>
            <Label>Activités prévues</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {TASK_OPTIONS.map((task) => {
                const selected = selectedTasks.includes(task);
                return (
                  <button
                    key={task}
                    type="button"
                    onClick={() => toggleTask(task)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      selected
                        ? "bg-[#8b5cf6] text-white border-[#8b5cf6]"
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

          <Button
            type="submit"
            className="bg-[#8b5cf6] hover:bg-[#7c3aed] w-full"
            disabled={createMut.isPending}
            data-testid="btn-submit-prestation"
          >
            {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            Envoyer la demande
          </Button>
        </form>
      </Form>
    </div>
  );
}

// ==================== CONTACT ADMIN TAB ====================

function ContactTab() {
  const { toast } = useToast();

  const form = useForm<ReferentContactInput>({
    resolver: zodResolver(referentContactSchema),
    defaultValues: { subject: "", message: "" },
  });

  const sendMut = useMutation({
    mutationFn: (data: ReferentContactInput) => apiRequest("POST", "/api/referent/contact-admin", data),
    onSuccess: () => {
      form.reset();
      toast({ title: "Message envoyé", description: "L'équipe FEVES a reçu votre message et vous répondra rapidement." });
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'envoyer le message pour le moment.", variant: "destructive" });
    },
  });

  return (
    <div className="max-w-lg">
      <h3 className="text-base font-semibold mb-1">Contacter l'équipe FEVES</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Posez vos questions ou signalez tout problème à l'équipe. Nous vous répondrons dans les plus brefs délais.
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => sendMut.mutate(data))} className="space-y-4">
          <FormField
            control={form.control}
            name="subject"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sujet <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input placeholder="Ex : Question sur une prestation" {...field} data-testid="input-contact-subject" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Décrivez votre demande ou problème..."
                    rows={5}
                    className="resize-none"
                    {...field}
                    data-testid="input-contact-message"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="bg-[#8b5cf6] hover:bg-[#7c3aed] w-full"
            disabled={sendMut.isPending}
            data-testid="btn-send-contact"
          >
            {sendMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Mail className="w-4 h-4 mr-1" />}
            Envoyer le message
          </Button>
        </form>
      </Form>
    </div>
  );
}

// ==================== PROFIL TAB ====================

function ProfilTab() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-md space-y-4">
      <Card data-testid="card-profil-referent">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-4 mb-4">
            <img
              src={getPhotoUrl(user.profilePhoto)}
              alt={`${user.firstName} ${user.lastName}`}
              className="w-16 h-16 rounded-full object-cover"
            />
            <div>
              <p className="font-bold text-lg">{user.firstName} {user.lastName}</p>
              <Badge className="bg-violet-100 text-violet-800 text-xs">Référent sénior</Badge>
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">Email</Label>
            <p className="font-medium mt-0.5" data-testid="text-profil-email">{user.email}</p>
          </div>
          {user.phone && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Téléphone</Label>
              <p className="font-medium mt-0.5" data-testid="text-profil-phone">{user.phone}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Pour modifier vos informations, contactez l'équipe FEVES.
      </p>
    </div>
  );
}

// ==================== MAIN REFERENT PAGE ====================

export default function ReferentHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const { toast } = useToast();

  useSSE(!!user);

  const { data: senior, isLoading: seniorLoading } = useQuery<UserType>({
    queryKey: ["/api/referent/senior"],
    enabled: !!user,
    retry: false,
  });

  const { data: relations = [], isLoading: relLoading } = useQuery<RelationWithUsers[]>({
    queryKey: ["/api/referent/relations"],
    enabled: !!user,
  });

  if (!user) return null;

  const isLoading = seniorLoading || relLoading;
  const activeRelations = relations.filter((r) => r.status === "ACTIVE");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-referent-title">
            Bonjour {user.firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Espace référent sénior</p>
        </div>
        <Badge className="bg-violet-100 text-violet-800">Référent</Badge>
      </div>

      {isLoading && (
        <Skeleton className="w-full mb-6 rounded-2xl h-14" data-testid="skeleton-proposer-rencontre-permanent" />
      )}
      {!isLoading && activeRelations.length > 0 && (
        <Button
          className="w-full mb-6 rounded-2xl h-14 text-base font-semibold bg-[#8b5cf6] hover:bg-[#7c3aed] text-white shadow-sm"
          onClick={() => {
            if (activeRelations.length === 1) {
              setLocation(`/relations/${activeRelations[0].id}`);
            } else {
              setActiveTab("suivi");
            }
          }}
          data-testid="button-proposer-rencontre-permanent"
        >
          <Calendar className="w-5 h-5 mr-2" /> Proposer une rencontre
        </Button>
      )}

      <MobileTabsMenu tabs={TABS} activeTab={activeTab} onSelect={(id) => setActiveTab(id as TabId)} accentClassName="bg-[#8b5cf6] text-white" />

      <div className="hidden md:flex flex-wrap gap-2 mb-8">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                isActive ? "bg-[#8b5cf6] text-white" : "bg-white text-muted-foreground hover:bg-muted"
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <>
          {activeTab === "dashboard" && <DashboardTab senior={senior ?? null} relations={relations} />}
          {activeTab === "suivi" && <SuiviTab relations={relations} />}
          {activeTab === "prestation" && <PrestationTab relations={relations} />}
          {activeTab === "contact" && <ContactTab />}
          {activeTab === "profil" && <ProfilTab />}
        </>
      )}
    </div>
  );
}
