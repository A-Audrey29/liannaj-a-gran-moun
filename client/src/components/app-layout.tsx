import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Menu } from "lucide-react";
import { useState } from "react";

function NavLinks({ authenticated, role, onClick }: { authenticated: boolean; role?: string; onClick?: () => void }) {
  const [location] = useLocation();

  if (!authenticated) {
    return (
      <>
        <Link href="/login" onClick={onClick}>
          <Button variant="outline" size="sm" className="rounded-full text-sm" data-testid="link-connexion">Connexion</Button>
        </Link>
        <Link href="/register" onClick={onClick}>
          <Button size="sm" className="rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white text-sm" data-testid="link-inscription">Inscription</Button>
        </Link>
      </>
    );
  }

  return (
    <>
      {role !== "ADMIN" && (
        <Link href="/mon-espace" onClick={onClick} className={`text-sm font-medium hover:text-[#dc4256] transition-colors ${location === "/mon-espace" ? "text-[#dc4256]" : ""}`} data-testid="link-mon-espace">MON ESPACE</Link>
      )}
      {role === "ADMIN" && (
        <Link href="/admin" onClick={onClick} className={`text-sm font-medium hover:text-[#dc4256] transition-colors ${location === "/admin" ? "text-[#dc4256]" : ""}`} data-testid="link-admin">ADMIN</Link>
      )}
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/login");
    } catch {
      toast({ title: "Erreur", description: "Impossible de se deconnecter", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 bg-white border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" data-testid="link-home-logo">
            <span className="font-serif font-bold tracking-tight text-[#dc4256] text-xl md:text-2xl">liannaj a gran moun</span>
          </Link>

          <nav className="hidden md:flex items-center gap-4">
            <NavLinks authenticated={isAuthenticated} role={user?.role} />
            {isAuthenticated && (
              <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full text-sm" data-testid="button-logout">
                Déconnexion
              </Button>
            )}
          </nav>

          <div className="flex md:hidden items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Menu" data-testid="button-mobile-menu">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                </TooltipTrigger>
                <TooltipContent>Menu</TooltipContent>
              </Tooltip>
              <SheetContent side="right" className="w-72 bg-white">
                <div className="flex flex-col gap-4 pt-8">
                  <NavLinks authenticated={isAuthenticated} role={user?.role} onClick={() => setMobileOpen(false)} />
                  {isAuthenticated && (
                    <Button variant="outline" onClick={() => { handleLogout(); setMobileOpen(false); }} className="mt-4 rounded-full" data-testid="button-logout-mobile">
                      Déconnexion
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="bg-white border-t border-border/50 mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Confiance & Legal</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Mentions legales</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Politique de confidentialite</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Charte de confiance</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</h4>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                contact@baicoco.fr
              </p>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t text-center text-xs text-muted-foreground">
            &copy; liannaj a gran moun 2026
          </div>
        </div>
      </footer>
    </div>
  );
}
