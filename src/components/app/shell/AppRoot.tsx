"use client";

import dynamic from "next/dynamic";

// All views are client-only: their first paint is a skeleton on the server AND
// the client (data is fetched client-side), which keeps hydration output
// deterministic regardless of query-vs-chunk load races.
import { useHashRouter, useUi } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";
import { motion, useReducedMotion } from "framer-motion";
import { TopBar } from "./TopBar";
import { NavRail, MobileNav, BrandLockup } from "./NavRail";
import { ViewBreadcrumb } from "./ViewBreadcrumb";
import { useViewSeo } from "@/lib/client/seo";

// Route-level lazy loading: each view splits into its own chunk (recharts,
// markdown and friends only load when their view activates). Skeletons match
// the view chrome so there is no layout shift.
const ViewSkeleton = () => (
  <div className="flex-1 min-h-0 flex flex-col gap-0" aria-busy="true" aria-label="Loading view">
    <div className="hairline-b bg-white px-4 sm:px-6 py-3">
      <div className="h-5 w-52 rounded shimmer" />
      <div className="mt-2 h-3 w-72 rounded shimmer" />
    </div>
    <div className="flex-1 grid place-items-center p-6">
      <div className="w-full max-w-md space-y-3">
        <div className="h-24 rounded-xl shimmer" />
        <div className="h-24 rounded-xl shimmer" />
        <div className="h-24 rounded-xl shimmer" />
      </div>
    </div>
  </div>
);

const CommandCenterView = dynamic(() => import("../views/command/CommandCenterView").then((m) => m.CommandCenterView), { ssr: false, loading: ViewSkeleton });
const MapExplorerView = dynamic(() => import("../views/mapview/MapExplorerView").then((m) => m.MapExplorerView), { ssr: false, loading: ViewSkeleton });
const EventDetailView = dynamic(() => import("../views/event/EventDetailView").then((m) => m.EventDetailView), { ssr: false, loading: ViewSkeleton });
const InvestigateView = dynamic(() => import("../views/investigate/InvestigateView").then((m) => m.InvestigateView), { ssr: false, loading: ViewSkeleton });
const ResponsibilityView = dynamic(() => import("../views/responsibility/ResponsibilityView").then((m) => m.ResponsibilityView), { ssr: false, loading: ViewSkeleton });
const VerificationView = dynamic(() => import("../views/verification/VerificationView").then((m) => m.VerificationView), { ssr: false, loading: ViewSkeleton });
const ReportView = dynamic(() => import("../views/report/ReportView").then((m) => m.ReportView), { ssr: false, loading: ViewSkeleton });
const AnalyticsView = dynamic(() => import("../views/analytics/AnalyticsView").then((m) => m.AnalyticsView), { ssr: false, loading: ViewSkeleton });
const HealthView = dynamic(() => import("../views/health/HealthView").then((m) => m.HealthView), { ssr: false, loading: ViewSkeleton });

// Root layout: dark sidebar + light content, sticky footer (flex column, mt-auto).
// View switches animate in (fade + slight rise, reduced-motion aware).
// Each view also drives its own <title>/description via useViewSeo.
export function AppRoot() {
  useHashRouter();
  const view = useUi((s) => s.view);
  const eventId = useUi((s) => s.eventId);
  const reduce = useReducedMotion();
  useViewSeo(view, eventId);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <NavRail />
        <main className="flex-1 min-w-0 min-h-0 flex flex-col pb-[76px] lg:pb-0" id="main">
          <ViewBreadcrumb />
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
      <nav aria-label="Footer" className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.62rem]">
        <FooterLink href="#/map" label="Waterlogging Map" />
        <FooterLink href="#/report" label="Report An Issue" />
        <FooterLink href="#/verify" label="Field Verification" />
        <FooterLink href="#/analytics" label="Research & Analytics" />
        <FooterLink href="#/health" label="Data & Model Health" />
        <span className="hidden sm:inline text-slate-300" aria-hidden>·</span>
        <FooterLink href="/llms.txt" label="For AI Assistants" external />
        <FooterLink href="/sitemap.xml" label="Sitemap" external />
        <FooterLink href="/robots.txt" label="Robots" external />
      </nav>
    </footer>
  );
}

function FooterLink({ href, label, external, onClick }: { href: string; label: string; external?: boolean; onClick?: () => void }) {
  return (
    <a
      href={href}
      onClick={onClick}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="rounded px-1 py-0.5 text-slate-500 hover:text-water transition-colors"
    >
      {label}
    </a>
  );
}
