"use client";

import { useHashRouter, useUi } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";
import { motion, useReducedMotion } from "framer-motion";
import { TopBar } from "./TopBar";
import { NavRail, MobileNav, BrandLockup } from "./NavRail";
import { CommandCenterView } from "../views/command/CommandCenterView";
import { MapExplorerView } from "../views/mapview/MapExplorerView";
import { EventDetailView } from "../views/event/EventDetailView";
import { InvestigateView } from "../views/investigate/InvestigateView";
import { ResponsibilityView } from "../views/responsibility/ResponsibilityView";
import { VerificationView } from "../views/verification/VerificationView";
import { ReportView } from "../views/report/ReportView";
import { AnalyticsView } from "../views/analytics/AnalyticsView";
import { HealthView } from "../views/health/HealthView";

// Root layout: dark sidebar + light content, sticky footer (flex column, mt-auto).
// View switches animate in (fade + slight rise, reduced-motion aware).
export function AppRoot() {
  useHashRouter();
  const view = useUi((s) => s.view);
  const eventId = useUi((s) => s.eventId);
  const reduce = useReducedMotion();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <NavRail />
        <main className="flex-1 min-w-0 min-h-0 flex flex-col pb-[76px] lg:pb-0" id="main">
          <motion.div
            key={`${view}:${eventId ?? ""}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.21, 0.47, 0.32, 0.98] }}
            className="flex flex-col flex-1 min-h-0"
          >
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
          </motion.div>
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
    <footer className="mt-auto hairline-t bg-white">
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.65rem] text-muted-foreground">
        <BrandLockup compact />
        <span className="hidden sm:inline text-slate-600 font-medium">Urban Event Intelligence · Delhi pilot</span>
        <span className="text-slate-400">Research prototype · synthetic demo data · not a deployed government system</span>
        {data && (
          <span className="data-mono ml-auto text-slate-400">
            {data.riskEngine} · {data.classification} · {data.routingRules}
          </span>
        )}
      </div>
    </footer>
  );
}
