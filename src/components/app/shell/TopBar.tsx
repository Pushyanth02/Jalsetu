"use client";

import { useUi, navigate } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type OverviewResponse } from "@/lib/client/api";
import { useClock } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import { Menu, X, Droplet, ChevronDown } from "lucide-react";
import { useState } from "react";
import { NAV_ITEMS } from "./NavRail";

export function TopBar() {
  const view = useUi((s) => s.view);
  const { data } = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview").then((r) => r.data),
    refetchInterval: 60_000,
  });
  const now = useClock();
  const [menuOpen, setMenuOpen] = useState(false);

  const label = NAV_ITEMS.find((n) => n.id === view)?.label ?? "Command Center";
  const ai = data?.ai;

  return (
    <header className="sticky top-0 z-30 bg-ink-950/92 backdrop-blur hairline-b">
      <div className="flex items-center gap-3 px-3 sm:px-5 h-14">
        <button
          className="lg:hidden p-2 -ml-1 text-muted-foreground hover:text-foreground"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <button
          onClick={() => navigate("command")}
          className="flex items-center gap-2.5 shrink-0 group"
          aria-label="Varuna home"
        >
          <Droplet className="size-5 text-water" aria-hidden />
          <span className="font-display font-bold tracking-tight text-[1.02rem] leading-none hidden sm:block">
            VARUNA
          </span>
          <span className="hidden md:block hairline-l pl-2.5 text-xs text-muted-foreground leading-tight max-w-56 truncate">
            Delhi Urban Event Intelligence
          </span>
        </button>

        <span aria-hidden className="hidden lg:block hairline-l pl-3 ml-1 micro-label text-muted-foreground">
          {label}
        </span>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span
            className="hidden md:inline-flex items-center gap-1.5 rounded-sm border border-sev-moderate/25 bg-sev-moderate/6 px-2 py-1 micro-label !text-[0.58rem] text-sev-moderate/90"
            title="All pilot data in this prototype is synthetic. Live submissions are labelled separately."
          >
            synthetic demo data
          </span>
          {ai && (
            <span
              className="hidden sm:inline-flex items-center gap-1.5 rounded-sm border border-slate-400/25 bg-slate-400/6 px-2 py-1 micro-label !text-[0.58rem]"
              title={ai.available ? `AI provider: ${ai.modelId} (${ai.configuredBy})` : "AI provider unavailable - deterministic fallback active"}
            >
              <span aria-hidden className={cn("size-1.5 rounded-full", ai.available ? "bg-verified" : "bg-sev-moderate")} />
              {ai.provider === "GLM" ? "GLM online" : ai.provider === "MOCK" ? "deterministic" : ai.provider.toLowerCase()}
            </span>
          )}
          {data && (
            <span className="hidden md:inline-flex data-mono text-[0.65rem] text-muted-foreground" title="Pilot rainfall (synthetic), 24h">
              <span className="text-water mr-1" aria-hidden>☂</span>
              {Math.round(data.rainfall.pilot24hMm)}mm/24h
            </span>
          )}
          <time className="data-mono text-[0.68rem] text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
            {now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" })} IST
          </time>
        </div>
      </div>

      {menuOpen && (
        <div className="lg:hidden border-t border-border/60 bg-ink-900/98 max-h-[70dvh] overflow-y-auto">
          <ul className="py-2">
            {NAV_ITEMS.filter((n) => n.id !== "event").map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(item.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-5 py-3 text-sm text-left",
                    view === item.id ? "text-water bg-water/6" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                  <ChevronDown className="size-3.5 ml-auto -rotate-90 opacity-40" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
