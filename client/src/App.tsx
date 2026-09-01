import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/app-layout";
import { PageTabsProvider } from "@/lib/page-tabs-context";
import AuthGuard from "@/components/auth-guard";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import RegistrationPending from "@/pages/registration-pending";
import Validate from "@/pages/validate";
import ValidationSuccess from "@/pages/validation-success";
import ValidationError from "@/pages/validation-error";
import RelationDetail from "@/pages/relation-detail";
import Notifications from "@/pages/notifications";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/use-auth";

// Pages lourdes ou peu fréquentées, chargées à la demande : elles n'ont pas à
// peser sur le premier affichage. La connexion mobile est souvent lente aux
// Antilles, et un sénior n'ouvrira jamais l'espace administrateur.
const Admin = lazy(() => import("@/pages/admin"));
const ReferentHome = lazy(() => import("@/pages/referent"));
const TeacherHome = lazy(() => import("@/pages/teacher"));
const MentionsLegales = lazy(() => import("@/pages/mentions-legales"));
const PolitiqueConfidentialite = lazy(() => import("@/pages/politique-confidentialite"));
const CGU = lazy(() => import("@/pages/cgu"));

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || user.role !== "ADMIN") return <NotFound />;
  return <>{children}</>;
}

/** Affiché le temps qu'un module chargé à la demande arrive. */
function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" data-testid="page-loader">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function Router() {
  return (
    <PageTabsProvider>
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/mon-espace">
          <AuthGuard><Home /></AuthGuard>
        </Route>
        <Route path="/admin">
          <AuthGuard><AdminGuard><Admin /></AdminGuard></AuthGuard>
        </Route>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/registration-pending" component={RegistrationPending} />
        <Route path="/validate" component={Validate} />
        <Route path="/validation-success" component={ValidationSuccess} />
        <Route path="/validation-error" component={ValidationError} />
        <Route path="/espace-referent">
          <AuthGuard><ReferentHome /></AuthGuard>
        </Route>
        <Route path="/espace-professeur">
          <AuthGuard><TeacherHome /></AuthGuard>
        </Route>
        <Route path="/notifications">
          <AuthGuard><Notifications /></AuthGuard>
        </Route>
        <Route path="/relations/:id">
          <AuthGuard><RelationDetail /></AuthGuard>
        </Route>
        {/* Accessibles sans authentification : un visiteur doit pouvoir les
            lire avant de créer un compte. */}
        <Route path="/mentions-legales" component={MentionsLegales} />
        <Route path="/politique-confidentialite" component={PolitiqueConfidentialite} />
        <Route path="/cgu" component={CGU} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </AppLayout>
    </PageTabsProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
