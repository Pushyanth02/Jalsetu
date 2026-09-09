"use client";

import { useHashRouter, useUi } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";
import { TopBar } from "./TopBar";
import { NavRail, MobileNav } from "./NavRail";
import { CommandCenterView } from "../views/command/CommandCenterView";
import { MapExplorerView } from "../views/mapview/MapExplorerView";
import { EventDetailView } from "../views/event/EventDetailView";
import { InvestigateView } from "../views/investigate/InvestigateView";
import { ResponsibilityView } from "../views/responsibility/ResponsibilityView";
import { VerificationView } from "../views/verification/VerificationView";
import { ReportView } from "../views/report/ReportView";
import { AnalyticsView } from "../views/analytics/AnalyticsView";
import { HealthView } from "../views/health/HealthView";

// Root layout: sticky footer pattern (flex column, mt-auto footer).
export function AppRoot() {
  useHashRouter();
  const view = useUi((s) => s.view);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <NavRail />
        <main className="flex-1 min-w-0 min-h-0 flex flex-col pb-[68px] lg:pb-0" id="main">
          {view === "command" && <CommandCenterView />}
          {view === "map" && <MapExplorerView />}
          {view === "event" && <EventDetailView />}
          {view === "investigate" && <InvestigateView />}
          {view === "responsibility" && <ResponsibilityView />}
          {view === "verify" && <VerificationView />}
          {view === "report" && <ReportView />}
          {view === "analytics" && <AnalyticsView />}
          {view === "health" && <HealthView />}
          <AppFooter />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function AppFooter() {
  const { data } = useQuery({
    queryKey: ["footer-versions"],
    queryFn: () => apiGet<{ versions: Record<string, string> }>("/api/model-health").then((r) => r.data.versions),
    staleTime: 300_000,
  });
  return (
    <footer className="mt-auto hairline-t bg-ink-900/40">
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.65rem] text-muted-foreground">
        <span className="font-display font-bold text-foreground/80 tracking-tight">VARUNA</span>
        <span>Urban Event Intelligence · Delhi pilot</span>
        <span className="text-muted-foreground/70">Research prototype · synthetic demo data · not a deployed government system</span>
        {data && (
          <span className="data-mono ml-auto text-muted-foreground/60">
            {data.riskEngine} · {data.classification} · {data.routingRules}
          </span>
        )}
      </div>
    </footer>
  );
}
