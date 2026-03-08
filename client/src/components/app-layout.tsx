import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Menu, Bell, LogOut, X } from "lucide-react";
import { useState } from "react";
import type { Notification } from "@shared/schema";

function timeAgo(date: string | Date) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "A l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)}j`;
  return d.toLocaleDateString("fr-FR");
}

function NotificationBell() {
  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/count"],
    refetchInterval: 30000,
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const [, setLocation] = useLocation();
  const count = countData?.count || 0;
  const recent = (notifications || []).slice(0, 10);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute -top-1 -right-1 bg-[#dc4256] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b font-semibold text-sm">Notifications</div>
        <ScrollArea className="max-h-80">
          {recent.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Aucune notification</div>
          ) : (
            recent.map((n) => (
              <button
                key={n.id}
                className={`w-full text-left px-3 py-3 border-b last:border-0 transition-colors hover:bg-muted/50 ${!n.isRead ? "bg-secondary/30" : ""}`}
                onClick={() => {
                  if (!n.isRead) markReadMutation.mutate(n.id);
                  if ((n as any).link) setLocation((n as any).link);
                }}
                data-testid={`notification-${n.id}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  </div>
                  {!n.isRead && <span className="mt-1 w-2 h-2 rounded-full bg-[#dc4256] shrink-0" />}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
              </button>
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function NavLinks({ authenticated, role, onClick }: { authenticated: boolean; role?: string; onClick?: () => void }) {
  const [location] = useLocation();

  if (!authenticated) {
    return (
      <>
        <Link href="/" onClick={onClick} className={`text-sm font-medium hover:text-[#dc4256] transition-colors ${location === "/" ? "text-[#dc4256]" : ""}`}>ACCUEIL</Link>
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
      <Link href="/" onClick={onClick} className={`text-sm font-medium hover:text-[#dc4256] transition-colors ${location === "/" ? "text-[#dc4256]" : ""}`} data-testid="link-accueil">ACCUEIL</Link>
      <Link href="/mon-espace" onClick={onClick} className={`text-sm font-medium hover:text-[#dc4256] transition-colors ${location === "/mon-espace" ? "text-[#dc4256]" : ""}`} data-testid="link-mon-espace">MON ESPACE</Link>
      {role === "ADMIN" && (
        <Link href="/admin" onClick={onClick} className="text-sm font-medium hover:text-[#dc4256] transition-colors" data-testid="link-admin">Admin</Link>
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
            <span className="font-brand text-[#dc4256] text-xl md:text-2xl">liannaj a gran moun</span>
          </Link>

          <nav className="hidden md:flex items-center gap-4">
            <NavLinks authenticated={isAuthenticated} role={user?.role} />
            {isAuthenticated && (
              <>
                <NotificationBell />
                <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-logout">
                  <LogOut className="w-5 h-5" />
                </Button>
              </>
            )}
          </nav>

          <div className="flex md:hidden items-center gap-2">
            {isAuthenticated && <NotificationBell />}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 bg-white">
                <div className="flex flex-col gap-4 pt-8">
                  <NavLinks authenticated={isAuthenticated} role={user?.role} onClick={() => setMobileOpen(false)} />
                  {isAuthenticated && (
                    <Button variant="outline" onClick={() => { handleLogout(); setMobileOpen(false); }} className="mt-4" data-testid="button-logout-mobile">
                      <LogOut className="w-4 h-4 mr-2" /> Deconnexion
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
