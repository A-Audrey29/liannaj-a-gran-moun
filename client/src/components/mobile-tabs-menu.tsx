import type { LucideIcon } from "lucide-react";
import { useRegisterPageTabs } from "@/lib/page-tabs-context";

export type MobileTabItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export function MobileTabsMenu({
  tabs,
  activeTab,
  onSelect,
  getBadgeCount,
  accentClassName = "bg-[#dc4256] text-white",
}: {
  tabs: readonly MobileTabItem[];
  activeTab: string;
  onSelect: (id: string) => void;
  getBadgeCount?: (id: string) => number;
  accentClassName?: string;
}) {
  useRegisterPageTabs({ tabs, activeTab, onSelect, getBadgeCount, accentClassName });

  const current = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const CurrentIcon = current?.icon;

  return (
    <div className="flex md:hidden items-center gap-2 mb-8 text-lg font-semibold">
      {CurrentIcon && <CurrentIcon className="w-5 h-5" />}
      {current?.label}
    </div>
  );
}
