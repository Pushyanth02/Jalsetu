"use client";

import { useUi, useHashRouter, navigate, type ViewId } from "@/lib/client/store";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type OverviewResponse, type WeatherResponse } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { PulseDot, CountUp } from "@/components/motion/kit";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Map as MapIcon, FileSearch, Network, ClipboardCheck, Flag, BarChart3, Activity, Droplets, Umbrella, Plus,
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
  { id: "event", label: "Urban Events", icon: FileSearch, group: "ops" },
  { id: "investigate", label: "AI Investigation", icon: Activity, group: "flow" },
  { id: "responsibility", label: "Responsibility", icon: Network, group: "flow" },
  { id: "verify", label: "Field Verification", icon: ClipboardCheck, group: "flow" },
  { id: "report", label: "Citizen Report", icon: Flag, group: "flow" },
  { id: "analytics", label: "Research & Analytics", icon: BarChart3, group: "research" },
  { id: "health", label: "Data & Model Health", icon: Droplets, group: "research" },
];

/** JalSetu logo lockup (droplet mark + wordmark). */
export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      { }
      <img src="/img/jalsetu-mark.svg" alt="JalSetu brand mark" width={34} height={34} className="shrink-0 rounded-[10px]" />
      <span className="min-w-0">
        <span className="block font-display text-[1.05rem] font-bold leading-none text-white">JalSetu</span>
        {!compact && (
          <span className="mt-1 block text-[0.62rem] leading-tight text-sb-750 truncate">Delhi Waterlogging Intelligence</span>
        )}
      </span>
    </span>
  );
}

export function NavRail() {
  const view = useUi((s) => s.view);
  const eventId = useUi((s) => s.eventId);
  const reduce = useReducedMotion();
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
    <nav aria-label="Primary" className="hidden lg:flex w-60 shrink-0 flex-col bg-sb-900 border-r border-sidebar-border">
      <div className="px-5 pt-5 pb-4 border-b border-sidebar-border shrink-0">
        <button onClick={() => navigate("command")} className="w-full text-left" aria-label="JalSetu home">
          <BrandLockup />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-4 space-y-5">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="px-3 pb-2 micro-label !text-[0.56rem] !text-sb-750">{g.label}</p>
            <ul className="space-y-0.5">
              {NAV_ITEMS.filter((n) => n.group === g.key).map((item) => {
                const active = view === item.id;
                const disabled = item.id === "event" && !eventId;
                return (
                  <li key={item.id} className="relative">
                    <button
                      onClick={() => navigate(item.id, item.id === "event" ? eventId : undefined)}
                      disabled={disabled}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[0.84rem] font-medium transition-colors text-left",
                        active
                          ? "text-white bg-water/15"
                          : "text-sb-750 hover:text-white hover:bg-white/5",
                        disabled && "opacity-35 cursor-not-allowed hover:bg-transparent"
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-active-bar"
                          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-water-dim"
                          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
                          aria-hidden
                        />
                      )}
                      <item.icon className={cn("size-4 shrink-0", active ? "text-water-dim" : "text-sb-750")} aria-hidden />
                      <span className="truncate">{item.label}</span>
                      {item.id === "command" && data && (
                        <span className="ml-auto data-mono text-[0.62rem] text-sb-750">{data.counts.activeEvents}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <WeatherWidget />
    </nav>
  );
}

/** Sidebar weather card replicating the reference design: image + rainfall + condition + date. */
function WeatherWidget() {
  const now = useUiClock();
  const { data } = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview").then((r) => r.data),
    refetchInterval: 60_000,
  });
  const weatherQ = useQuery({
    queryKey: ["weather", 24],
    queryFn: () => apiGet<WeatherResponse>("/api/weather?hours=24").then((r) => r.data),
    refetchInterval: 120_000,
  });

  const mm = data ? Math.round(data.rainfall.pilot24hMm) : weatherQ.data?.stations.reduce((a, s) => a + s.totalMm, 0) ?? 0;
  const condition = mm >= 40 ? "Heavy rain" : mm >= 15 ? "Moderate rain" : mm > 0.5 ? "Light rain" : "Dry";
  const dateLabel = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  return (
    <div className="shrink-0 border-t border-sidebar-border p-4">
      <div className="relative overflow-hidden rounded-xl h-24">
        { }
        <Image
          src="/img/weather-delhi.png"
          alt="Delhi skyline in monsoon rain (illustrative)"
          fill
          sizes="280px"
          className="object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-sb-900/90 via-sb-900/30 to-transparent" aria-hidden />
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2">
          <div>
            <p className="flex items-baseline gap-1.5 leading-none">
              <span className="font-display text-2xl font-bold text-white">
                {data ? <CountUp value={mm} decimals={mm % 1 ? 1 : 0} /> : mm}
              </span>
              <span className="text-[0.6rem] font-medium text-slate-300">mm/24h</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[0.65rem] text-slate-300">
              <Umbrella className="size-3 text-water-dim" aria-hidden />
              {condition} · pilot gauges
            </p>
          </div>
          <PulseDot color="bg-emerald-400" size={7} className="mb-1" />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="data-mono text-[0.6rem] text-sb-750" suppressHydrationWarning>{dateLabel}</span>
        <span className="micro-label !text-[0.52rem] !text-sb-750/80">synthetic</span>
      </div>
    </div>
  );
}

function useUiClock() {
  // scoped clock (sidebar only re-renders on date change)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => {
      setNow((prev) => {
        const next = new Date();
        return next.getDate() === prev.getDate() ? prev : next;
      });
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Mobile bottom navigation with a raised report FAB, per reference design. */
export function MobileNav() {
  const view = useUi((s) => s.view);
  const reduce = useReducedMotion();
  const primary: NavItem[] = NAV_ITEMS.filter((n) => ["command", "map", "report", "verify", "analytics"].includes(n.id));
  const left = primary.filter((p) => p.id !== "report");
  return (
    <nav
      aria-label="Primary mobile"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/97 backdrop-blur border-t border-border shadow-[0_-4px_16px_rgba(15,23,42,0.06)] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5 items-end">
        {left.slice(0, 2).map((item) => (
          <MobileNavItem key={item.id} item={item} active={view === item.id} />
        ))}
        <li className="relative flex justify-center">
          <motion.button
            onClick={() => navigate("report")}
            whileTap={reduce ? undefined : { scale: 0.9 }}
            aria-label="Report a waterlogging issue"
            aria-current={view === "report" ? "page" : undefined}
            className={cn(
              "-mt-5 grid size-12 place-items-center rounded-full bg-water text-white shadow-lg shadow-water/30 transition-shadow",
              view === "report" && "ring-2 ring-water ring-offset-2 ring-offset-white"
            )}
          >
            <Plus className="size-6" aria-hidden />
          </motion.button>
        </li>
        {left.slice(2).map((item) => (
          <MobileNavItem key={item.id} item={item} active={view === item.id} />
        ))}
      </ul>
    </nav>
  );
}

function MobileNavItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <li>
      <button
        onClick={() => navigate(item.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full flex-col items-center gap-1 py-2.5 min-h-[56px] justify-center transition-colors",
          active ? "text-water" : "text-slate-400"
        )}
      >
        <item.icon className="size-5" aria-hidden />
        <span className="text-[0.6rem] font-medium leading-none">{item.label.split(" ")[0]}</span>
      </button>
    </li>
  );
}

export { useHashRouter };
