import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { UserAvatar } from "@/components/user-avatar";
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
import { referentContactSchema, type ReferentContactInput } from "@shared/schema";
import type { User as UserType, Relation, Intervention } from "@shared/schema";
import { LayoutGrid, Calendar, Plus, Mail, User, CheckCircle, Clock, Loader2, ChevronRight, BookOpen } from "lucide-react";
import { useState } from "react";
import { useSSE } from "@/hooks/use-sse";
import { MobileTabsMenu } from "@/components/mobile-tabs-menu";
import MeetingHistory from "@/components/meeting-history";
import { fmtTime, fmtDayLongMonthYear } from "@/lib/availability-format";
import { CreditOffersCard } from "@/components/credit-offers-card";
import { NpsPrompt } from "@/components/nps-prompt";
import { type CreditBalanceResponse } from "@shared/credits";
import { isUpcomingOrOngoing } from "@shared/meeting-check";

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
  { id: "suivi", label: "Suivi des ateliers", icon: Calendar },
  { id: "prestation", label: "Demander un atelier", icon: Plus },
  // Navigates to /mes-ateliers (see selectTab), same page as the senior's tab.
  { id: "ateliers", label: "Mes achats", icon: BookOpen },
  { id: "contact", label: "Contacter l'équipe", icon: Mail },
  { id: "profil", label: "Mon compte", icon: User },
] as const;

type TabId = typeof TABS[number]["id"];

// ==================== DASHBOARD TAB ====================

function DashboardTab({ senior, relations }: { senior: UserType | null; relations: RelationWithUsers[] }) {
  const [, setLocation] = useLocation();
  const { data: creditData } = useQuery<CreditBalanceResponse>({ queryKey: ["/api/credits/balance"] });
  const activeRelations = relations.filter((r) => r.status === "ACTIVE");
  const pendingRelations = relations.filter((r) => r.status === "PENDING" || r.status === "PENDING_FIRST_MEETING");

  const now = new Date();
  // The first meeting happens while the relation is still PENDING_FIRST_MEETING:
  // it is the one the aidant most needs to see.
  const upcomingInterventions = relations
    .filter((r) => r.status === "ACTIVE" || r.status === "PENDING_FIRST_MEETING")
    .flatMap((r) => (r.interventions || [])
      .filter((i) => isUpcomingOrOngoing(i, now))
      .map((i) => ({ ...i, juniorName: `${r.junior.firstName} ${r.junior.lastName}` })))
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  const next = upcomingInterventions[0] || null;

  return (
    <div className="space-y-6">
      <NpsPrompt />
      {senior && (
        <Card data-testid="card-linked-senior">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <UserAvatar photo={senior.profilePhoto} firstName={senior.firstName} lastName={senior.lastName} className="w-14 h-14" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Votre proche</p>
                <p className="text-lg font-bold" data-testid="text-senior-name">
                  {senior.firstName} {senior.lastName}
                </p>
                <p className="text-sm text-muted-foreground">{senior.city || ""}</p>
              </div>
              {creditData && (
                <button
                  type="button"
                  onClick={() => setLocation("/mes-ateliers")}
                  className="text-right hover:opacity-80"
                  data-testid="button-open-ateliers"
                >
                  <p className="text-2xl font-bold text-[#c0354a]" data-testid="text-credit-balance">
                    {Math.max(creditData.available, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    atelier{creditData.available > 1 ? "s" : ""} disponible{creditData.available > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-[#c0354a] underline">Voir le détail</p>
                </button>
              )}
            </div>
            {creditData && creditData.available <= 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-4">
                Plus d'atelier disponible pour une nouvelle réservation. Achetez un pack ci-dessous.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {senior && creditData && <CreditOffersCard />}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-3xl font-bold text-green-700">{activeRelations.length}</p>
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
            <p className="text-sm text-muted-foreground mt-1">Rencontre{upcomingInterventions.length > 1 ? "s" : ""} à venir</p>
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
                    <UserAvatar photo={r.junior.profilePhoto} firstName={r.junior.firstName} lastName={r.junior.lastName} className="w-10 h-10" />
                    <div>
                      <p className="font-medium">{r.junior.firstName} {r.junior.lastName}</p>
                      <p className="text-xs text-muted-foreground">{(r.interventions || []).length} rencontre{(r.interventions || []).length > 1 ? "s" : ""}</p>
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
                      className="w-full rounded-full text-xs bg-[#7c3aed] hover:bg-[#6d28d9] text-white mb-2"
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


/**
 * Asking for a workshop goes through the relation page, which shows the
 * junior's availability next to the form. A free date field here was typed
 * blind and often refused as outside the junior's slots.
 */
function PrestationTab({ relations }: { relations: RelationWithUsers[] }) {
  const [, setLocation] = useLocation();
  const activeRelations = relations.filter((r) => r.status === "ACTIVE");

  if (activeRelations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="text-no-active-relation">
        <p>Un atelier ne peut être demandé qu'après la première rencontre, avec un jeune déjà rencontré.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Demander un atelier</h3>
      <p className="text-sm text-muted-foreground">
        Choisissez le jeune, puis un de ses créneaux libres. Les heures sont celles de la Guadeloupe.
      </p>
      {activeRelations.map((r) => (
        <Card key={r.id} data-testid={`card-prestation-${r.id}`}>
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium">
              {r.junior.firstName} {r.junior.lastName}
            </p>
            <Button
              className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white"
              onClick={() => setLocation(`/relations/${r.id}`)}
              data-testid={`btn-prestation-${r.id}`}
            >
              Voir ses créneaux
            </Button>
          </CardContent>
        </Card>
      ))}
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
                  <Input placeholder="Ex : Question sur un atelier" {...field} data-testid="input-contact-subject" />
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
            className="bg-[#7c3aed] hover:bg-[#6d28d9] w-full"
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
            <UserAvatar photo={user.profilePhoto} firstName={user.firstName} lastName={user.lastName} className="w-16 h-16" />
            <div>
              <p className="font-bold text-lg">{user.firstName} {user.lastName}</p>
              <Badge className="bg-violet-100 text-violet-800 text-xs">Aidant</Badge>
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
  // "?tab=contact" opens a tab directly (used by the help link of /forfaits).
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const match = TABS.find((t) => t.id === tab && t.id !== "ateliers");
    return match ? match.id : "dashboard";
  });
  const { toast } = useToast();

  // "Mes achats" is a page of its own (shared with the senior space): the
  // tab opens it instead of rendering inside this page.
  function selectTab(id: TabId) {
    if (id === "ateliers") {
      setLocation("/mes-ateliers");
      return;
    }
    setActiveTab(id);
  }

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
          <p className="text-sm text-muted-foreground mt-0.5">Espace aidant</p>
        </div>
        <Badge className="bg-violet-100 text-violet-800">Aidant</Badge>
      </div>

      {isLoading && (
        <Skeleton className="w-full mb-6 rounded-2xl h-14" data-testid="skeleton-proposer-rencontre-permanent" />
      )}
      {!isLoading && activeRelations.length > 0 && (
        <Button
          className="w-full mb-6 rounded-2xl h-14 text-base font-semibold bg-[#7c3aed] hover:bg-[#6d28d9] text-white shadow-sm"
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

      <MobileTabsMenu tabs={TABS} activeTab={activeTab} onSelect={(id) => selectTab(id as TabId)} accentClassName="bg-[#7c3aed] text-white" />

      <div className="hidden md:flex flex-wrap gap-2 mb-8">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                isActive ? "bg-[#7c3aed] text-white" : "bg-white text-muted-foreground hover:bg-muted"
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
