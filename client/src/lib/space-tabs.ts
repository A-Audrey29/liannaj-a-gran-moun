import {
  BookOpen, Calendar, CalendarClock, HelpCircle, LayoutGrid, Mail, MessageCircle, Plus, User,
  type LucideIcon,
} from "lucide-react";

/**
 * The tabs of each user space, in one place: the pages render them as tabs,
 * and the header menu (burger) lists them as links on pages that are not
 * tabbed (Mes achats, a relation, notifications...) so it is never a dead end.
 */
export type SpaceTab = { id: string; label: string; icon: LucideIcon };

/** Senior / junior / admin space (/mon-espace, /admin shares the dashboard tabs). */
export const HOME_TABS = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { id: "rencontres", label: "Mes rencontres", icon: Calendar },
  { id: "disponibilites", label: "Mes disponibilités", icon: CalendarClock },
  // Navigates to /mes-ateliers; senior only.
  { id: "ateliers", label: "Mes achats", icon: BookOpen },
  { id: "messages", label: "Messagerie", icon: Mail },
  { id: "demandes", label: "Trouver un profil", icon: MessageCircle },
  { id: "profil", label: "Mes informations", icon: User },
  { id: "aide", label: "Aide", icon: HelpCircle },
] as const;

export function homeTabsFor(role: string | undefined): SpaceTab[] {
  const tabs: readonly SpaceTab[] = HOME_TABS;
  const list =
    role === "ADMIN"
      ? tabs.filter((t) => !["profil", "messages", "aide", "disponibilites"].includes(t.id))
      : role === "JUNIOR"
        ? tabs.filter((t) => t.id !== "aide").map((t) => (t.id === "demandes" ? { ...t, label: "Demandes reçues" } : t))
        : tabs.filter((t) => t.id !== "aide" && t.id !== "disponibilites");
  return list.filter((t) => t.id !== "ateliers" || role === "SENIOR");
}

/** Referent ("aidant") space (/espace-referent). */
export const REFERENT_TABS = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutGrid },
  { id: "suivi", label: "Suivi des ateliers", icon: Calendar },
  { id: "prestation", label: "Demander un atelier", icon: Plus },
  // Navigates to /mes-ateliers, same page as the senior's tab.
  { id: "ateliers", label: "Mes achats", icon: BookOpen },
  { id: "contact", label: "Contacter l'équipe", icon: Mail },
  { id: "profil", label: "Mon compte", icon: User },
] as const;

/** Page that holds the "Mes achats" tab, shared by seniors and referents. */
export const PURCHASES_PATH = "/mes-ateliers";

/**
 * Links for the header menu on a non-tabbed page. Seniors, juniors and
 * referents only: the admin and teacher spaces have no such sub-pages.
 */
export function spaceMenuLinks(role: string | undefined): { id: string; label: string; icon: LucideIcon; href: string }[] {
  const base = role === "REFERENT_SENIOR" ? "/espace-referent" : "/mon-espace";
  const tabs: SpaceTab[] =
    role === "REFERENT_SENIOR" ? [...REFERENT_TABS] : role === "SENIOR" || role === "JUNIOR" ? homeTabsFor(role) : [];
  return tabs.map((t) => ({
    ...t,
    href: t.id === "ateliers" ? PURCHASES_PATH : t.id === "dashboard" ? base : `${base}?tab=${t.id}`,
  }));
}
