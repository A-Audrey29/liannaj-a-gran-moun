import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthGuard from "@/components/auth-guard";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import RegistrationPending from "@/pages/registration-pending";
import ValidationSuccess from "@/pages/validation-success";
import ValidationError from "@/pages/validation-error";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/">
        <AuthGuard>
          <Home />
        </AuthGuard>
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/registration-pending" component={RegistrationPending} />
      <Route path="/validation-success" component={ValidationSuccess} />
      <Route path="/validation-error" component={ValidationError} />
      <Route component={NotFound} />
    </Switch>
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
