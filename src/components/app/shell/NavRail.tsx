"use client";

import { useUi, useHashRouter, navigate, type ViewId } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type OverviewResponse } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Map as MapIcon, FileSearch, Network, ClipboardCheck, Flag, BarChart3, Activity, Droplets,
} from "lucide-react";
interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "ops" | "flow" | "research";
}

export const NAV_ITEMS: NavItem[] = [
  { id: "command", label: "Command Center", icon: LayoutDashboard, group: "ops" },
  { id: "map", label: "Waterlogging Map", icon: MapIcon, group: "ops" },
  { id: "event", label: "Event Detail", icon: FileSearch, group: "ops" },
  { id: "investigate", label: "AI Investigation", icon: Activity, group: "flow" },
  { id: "responsibility", label: "Responsibility", icon: Network, group: "flow" },
  { id: "verify", label: "Field Verification", icon: ClipboardCheck, group: "flow" },
  { id: "report", label: "Citizen Report", icon: Flag, group: "flow" },
  { id: "analytics", label: "Analytics", icon: BarChart3, group: "research" },
  { id: "health", label: "Data & Model Health", icon: Droplets, group: "research" },
];

export function NavRail() {
  const view = useUi((s) => s.view);
  const eventId = useUi((s) => s.eventId);
  const { data } = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview").then((r) => r.data),
    refetchInterval: 60_000,
  });

  const groups: { key: NavItem["group"]; label: string }[] = [
    { key: "ops", label: "Operations" },
    { key: "flow", label: "Evidence Flow" },
    { key: "research", label: "Research" },
  ];

  return (
    <nav aria-label="Primary" className="hidden lg:flex w-52 shrink-0 flex-col hairline-r bg-ink-900/60">
      <div className="flex-1 overflow-y-auto py-3">
        {groups.map((g) => (
          <div key={g.key} className="mb-4">
            <p className="micro-label px-4 pb-1.5 !text-[0.56rem] text-muted-foreground/60">{g.label}</p>
            <ul>
              {NAV_ITEMS.filter((n) => n.group === g.key).map((item) => {
                const active = view === item.id;
                const disabled = item.id === "event" && !eventId;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => navigate(item.id, item.id === "event" ? eventId : undefined)}
                      disabled={disabled}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-4 py-2 text-[0.83rem] transition-colors text-left",
                        active
                          ? "text-foreground bg-water/8 border-l-2 border-water"
                          : "text-muted-foreground hover:text-foreground hover:bg-ink-850/60 border-l-2 border-transparent",
                        disabled && "opacity-40 cursor-not-allowed hover:bg-transparent"
                      )}
                    >
                      <item.icon className={cn("size-4 shrink-0", active ? "text-water" : "text-muted-foreground")} aria-hidden />
                      <span className="truncate">{item.label}</span>
                      {item.id === "command" && data && (
                        <span className="ml-auto data-mono text-[0.62rem] text-muted-foreground">{data.counts.activeEvents}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="hairline-t px-4 py-3">
        <p className="micro-label !text-[0.56rem] text-muted-foreground/70 leading-relaxed">
          Pilot · 3 jurisdictions
          <br />
          Model · risk-engine v1.3
        </p>
      </div>
    </nav>
  );
}

export function MobileNav() {
  const view = useUi((s) => s.view);
  const primary: NavItem[] = NAV_ITEMS.filter((n) => ["command", "map", "report", "verify", "analytics"].includes(n.id));
  return (
    <nav
      aria-label="Primary mobile"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-ink-900/95 backdrop-blur hairline-t pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {primary.map((item) => {
          const active = view === item.id;
          return (
            <li key={item.id}>
              <button
                onClick={() => navigate(item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full flex-col items-center gap-1 py-2.5 min-h-[52px] justify-center transition-colors",
                  active ? "text-water" : "text-muted-foreground"
                )}
              >
                <item.icon className="size-5" aria-hidden />
                <span className="text-[0.6rem] leading-none">{item.label.split(" ")[0]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { useHashRouter };
