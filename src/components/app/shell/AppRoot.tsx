"use client";

import dynamic from "next/dynamic";
import { useHashRouter, useUi } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client/api";
import { motion, useReducedMotion } from "framer-motion";
import { TopBar } from "./TopBar";
import { NavRail, MobileNav, BrandLockupLight } from "./NavRail";
import { ViewBreadcrumb } from "./ViewBreadcrumb";
import { useViewSeo } from "@/lib/client/seo";

const ViewSkeleton = () => (
  <div className="flex-1 min-h-0 flex flex-col gap-0" aria-busy="true" aria-label="Loading view">
    <div className="hairline-b bg-white px-4 sm:px-6 py-3.5">
      <div className="h-5 w-48 max-w-[60vw] rounded-lg shimmer" />
      <div className="mt-2 h-3 w-72 max-w-[80vw] rounded shimmer" />
    </div>
    <div className="flex-1 grid place-items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-3">
        <div className="h-24 rounded-xl shimmer" />
        <div className="h-24 rounded-xl shimmer" />
        <div className="h-20 rounded-xl shimmer hidden sm:block" />
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

export function AppRoot() {
  useHashRouter();
  const view = useUi((s) => s.view);
  const eventId = useUi((s) => s.eventId);
  const reduce = useReducedMotion();
  useViewSeo(view, eventId);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <NavRail />
        <main className="flex-1 min-w-0 min-h-0 flex flex-col pb-22 sm:pb-19 lg:pb-0" id="main" tabIndex={-1}>
          <ViewBreadcrumb />
          <motion.div
            key={`${view}:${eventId ?? ""}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.21, 0.47, 0.32, 0.98] }}
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

import { assetPath } from "@/lib/client/assets";

function AppFooter() {
  const { data } = useQuery({
    queryKey: ["footer-versions"],
    queryFn: () => apiGet<{ versions: Record<string, string> }>("/api/model-health").then((r) => r.data.versions),
    staleTime: 300_000,
  });
  return (
    <footer className="mt-auto hairline-t bg-white">
      <div className="px-3 sm:px-4 lg:px-6 py-3 flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-2 text-[0.65rem] text-muted-foreground">
        <span className="hidden sm:flex items-center gap-2">
          <BrandLockupLight compact />
        </span>
        <span className="sm:hidden flex items-center gap-2">
          <img src={assetPath("/img/jalsetu-mark.svg")} alt="" width={22} height={22} className="size-5.5 rounded-md shrink-0" aria-hidden />
          <span className="font-display font-bold text-slate-900 text-xs">JalSetu</span>
        </span>
        <span className="hidden md:inline text-slate-600 font-medium">Urban Event Intelligence · Delhi pilot</span>
        <span className="text-slate-400 hidden xs:inline text-[0.62rem] leading-tight">Research prototype · synthetic demo data · not a deployed government system</span>
        <span className="xs:hidden text-slate-400 text-[0.62rem]">Synthetic demo · not live</span>
        {data && (
          <span className="data-mono ml-auto hidden lg:inline text-slate-400 text-[0.62rem] break-safe">
            {data.riskEngine} · {data.classification} · {data.routingRules}
          </span>
        )}
      </div>
      <nav aria-label="Footer" className="px-3 sm:px-4 lg:px-6 pb-3 sm:pb-3 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1.5 text-[0.62rem]">
        <FooterLink href="#/map" label="Waterlogging Map" />
        <FooterLink href="#/report" label="Report An Issue" />
        <FooterLink href="#/verify" label="Field Verification" />
        <FooterLink href="#/analytics" label="Research & Analytics" />
        <FooterLink href="#/health" label="Data & Model Health" />
        <span className="hidden sm:inline text-slate-300" aria-hidden>·</span>
        <FooterLink href={assetPath("/llms.txt")} label="For AI Assistants" external />
        <FooterLink href={assetPath("/sitemap.xml")} label="Sitemap" external />
      </nav>
    </footer>
  );
}

function FooterLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="rounded-lg px-2 py-1.5 -mx-1 text-slate-500 hover:text-water hover:bg-slate-100 active:bg-slate-200 transition-colors touch-target inline-flex items-center"
    >
      {label}
    </a>
  );
}
