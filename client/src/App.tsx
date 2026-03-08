import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/app-layout";
import AuthGuard from "@/components/auth-guard";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Admin from "@/pages/admin";
import Login from "@/pages/login";
import Register from "@/pages/register";
import RegistrationPending from "@/pages/registration-pending";
import ValidationSuccess from "@/pages/validation-success";
import ValidationError from "@/pages/validation-error";
import RelationDetail from "@/pages/relation-detail";
import Notifications from "@/pages/notifications";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/use-auth";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || user.role !== "ADMIN") return <NotFound />;
  return <>{children}</>;
}

function Router() {
  return (
    <AppLayout>
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
        <Route path="/validation-success" component={ValidationSuccess} />
        <Route path="/validation-error" component={ValidationError} />
        <Route path="/notifications">
          <AuthGuard><Notifications /></AuthGuard>
        </Route>
        <Route path="/relations/:id">
          <AuthGuard><RelationDetail /></AuthGuard>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
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
