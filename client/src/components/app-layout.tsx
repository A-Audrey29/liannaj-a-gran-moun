import { PLATFORM_TAGLINE, PLATFORM_NAME, ORGANIZATION_NAME, CONTACT_EMAIL } from "@shared/branding";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { logout } from "@/lib/logout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { useState } from "react";
import { usePageTabsRegistry } from "@/lib/page-tabs-context";
import { Badge } from "@/components/ui/badge";
import { spaceMenuLinks } from "@/lib/space-tabs";

function NavLinks({ authenticated, role, onClick }: { authenticated: boolean; role?: string; onClick?: () => void }) {
  const [location] = useLocation();

  if (!authenticated) {
    return (
      <>
        <Link href="/login" onClick={onClick}>
          <Button variant="outline" size="sm" className="rounded-full text-sm" data-testid="link-connexion">Connexion</Button>
        </Link>
        <Link href="/register" onClick={onClick}>
          <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90 text-white text-sm" data-testid="link-inscription">Inscription</Button>
        </Link>
      </>
    );
  }

  const navLink = () => {
    if (role === "ADMIN") return { href: "/admin", label: "ADMIN", testId: "link-admin" };
    if (role === "REFERENT_SENIOR") return { href: "/espace-referent", label: "MON ESPACE", testId: "link-espace-referent" };
    if (role === "TEACHER") return { href: "/espace-professeur", label: "ESPACE PROFESSEUR", testId: "link-espace-professeur" };
    return { href: "/mon-espace", label: "MON ESPACE", testId: "link-mon-espace" };
  };

  const { href, label, testId } = navLink();

  return (
    <>
      <Link href={href} onClick={onClick} className={`text-sm font-medium hover:text-primary transition-colors ${location === href ? "text-primary" : ""}`} data-testid={testId}>
        {label}
      </Link>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTabs = usePageTabsRegistry();
  // Pages without tabs (Mes achats, a meeting, notifications...) still get the
  // space menu, so the burger is never a dead end.
  const spaceLinks = !pageTabs && isAuthenticated ? spaceMenuLinks(user?.role) : [];

  const handleLogout = async () => {
    try {
      await logout(setLocation);
    } catch {
      toast({ title: "Erreur", description: "Impossible de se déconnecter", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary focus:shadow-lg focus:ring-2 focus:ring-ring"
        data-testid="link-skip-to-content"
      >
        Aller au contenu
      </a>
      <header className="sticky top-0 z-50 bg-white border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex min-h-11 items-center" data-testid="link-home-logo">
            <span className="font-serif font-bold tracking-tight text-primary text-xl md:text-2xl">{PLATFORM_TAGLINE}</span>
          </Link>

          <nav aria-label="Navigation principale" className="hidden md:flex items-center gap-4">
            <NavLinks authenticated={isAuthenticated} role={user?.role} />
            {isAuthenticated && (
              <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full text-sm" data-testid="button-logout">
                Déconnexion
              </Button>
            )}
          </nav>

          <div className="flex md:hidden items-center gap-2">
            {/* Returning seniors look for the login button first: keep it
                visible instead of hidden in the menu. */}
            {!isAuthenticated && location !== "/login" && (
              <Link href="/login">
                <Button variant="outline" size="sm" className="rounded-full text-sm" data-testid="link-connexion-mobile">
                  Connexion
                </Button>
              </Link>
            )}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu" data-testid="button-mobile-menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 bg-white overflow-y-auto">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <div className="flex flex-col gap-4 pt-8">
                  <NavLinks authenticated={isAuthenticated} role={user?.role} onClick={() => setMobileOpen(false)} />

                  {spaceLinks.length > 0 && (
                    <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border/50" data-testid="menu-space-links">
                      {spaceLinks.map((item) => {
                        const Icon = item.icon;
                        const isActive = location === item.href;
                        return (
                          <Link
                            key={item.id}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            aria-current={isActive ? "page" : undefined}
                            className={`flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-full text-sm font-medium transition-colors ${
                              isActive ? "bg-primary text-white" : "bg-white text-muted-foreground hover:bg-muted"
                            }`}
                            data-testid={`menu-link-${item.id}`}
                          >
                            <Icon className="w-4 h-4" aria-hidden="true" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {pageTabs && (
                    <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-border/50">
                      {pageTabs.tabs.map((tab) => {
                        const isActive = tab.id === pageTabs.activeTab;
                        const Icon = tab.icon;
                        const count = pageTabs.getBadgeCount?.(tab.id) ?? 0;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => {
                              pageTabs.onSelect(tab.id);
                              setMobileOpen(false);
                            }}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                              isActive ? pageTabs.accentClassName : "bg-white text-muted-foreground hover:bg-muted"
                            }`}
                            data-testid={`mobile-tab-${tab.id}`}
                          >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            {count > 0 && (
                              <Badge className={`ml-1 text-xs px-1.5 py-0 ${isActive ? "bg-white text-gray-900" : ""}`}>
                                {count}
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

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

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>

      <footer className="bg-white border-t border-border/50 mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Confiance &amp; légal</h2>
              <ul className="text-sm text-muted-foreground">
                <li>
                  <Link href="/mentions-legales" className="inline-flex min-h-11 items-center md:min-h-0 md:py-1 hover:text-foreground transition-colors" data-testid="link-mentions-legales">
                    Mentions légales
                  </Link>
                </li>
                <li>
                  <Link href="/politique-confidentialite" className="inline-flex min-h-11 items-center md:min-h-0 md:py-1 hover:text-foreground transition-colors" data-testid="link-confidentialite">
                    Politique de confidentialité
                  </Link>
                </li>
                <li>
                  <Link href="/cgu" className="inline-flex min-h-11 items-center md:min-h-0 md:py-1 hover:text-foreground transition-colors" data-testid="link-cgu">
                    Conditions d'utilisation
                  </Link>
                </li>
                <li>
                  <Link href="/cgv" className="inline-flex min-h-11 items-center md:min-h-0 md:py-1 hover:text-foreground transition-colors" data-testid="link-cgv">
                    Conditions de vente
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Contact</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex min-h-11 items-center md:min-h-0 md:py-1 hover:text-foreground transition-colors" data-testid="link-contact-email">{CONTACT_EMAIL}</a>
              </p>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t text-center text-xs text-muted-foreground">
            {PLATFORM_NAME} — {ORGANIZATION_NAME} {new Date().getFullYear()}
          </div>
        </div>
      </footer>
    </div>
  );
}
