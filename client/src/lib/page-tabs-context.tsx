import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type PageTabItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

type PageTabsState = {
  tabs: readonly PageTabItem[];
  activeTab: string;
  onSelect: (id: string) => void;
  getBadgeCount?: (id: string) => number;
  accentClassName: string;
} | null;

const PageTabsContext = createContext<{
  state: PageTabsState;
  setState: (s: PageTabsState) => void;
} | null>(null);

export function PageTabsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PageTabsState>(null);
  return (
    <PageTabsContext.Provider value={{ state, setState }}>
      {children}
    </PageTabsContext.Provider>
  );
}

export function usePageTabsRegistry() {
  const ctx = useContext(PageTabsContext);
  if (!ctx) throw new Error("usePageTabsRegistry must be used within PageTabsProvider");
  return ctx.state;
}

export function useRegisterPageTabs(state: NonNullable<PageTabsState>) {
  const ctx = useContext(PageTabsContext);
  if (!ctx) throw new Error("useRegisterPageTabs must be used within PageTabsProvider");
  const { setState } = ctx;

  useEffect(() => {
    setState(state);
    return () => setState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tabs, state.activeTab, state.onSelect, state.getBadgeCount, state.accentClassName]);
}
