"use client";

import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Droplets, Radar, FileSearch, Network, ClipboardCheck, Flag, BarChart3,
  Activity, ArrowRight, MapPin, ShieldCheck, Tags, FileText, Menu, X,
  Layers, CloudRain, Building2, Clock3, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { navigate, type ViewId } from "@/lib/client/store";
import { assetPath, assetSrcSet } from "@/lib/client/assets";
import { apiGet, type OverviewResponse, type HotspotResponse } from "@/lib/client/api";
import { Reveal, Stagger, StaggerItem, CountUp, SpotlightCard, PulseDot, AnimatedProgress } from "@/components/motion/kit";
import { cn } from "@/lib/utils";

/**
 * LANDING — the front door of the Monsoon ink site.
 *
 * Sits outside the ops shell (no TopBar / NavRail): this is the public face,
 * the console is the product behind it. Every number on this page is read
 * from the same in-browser API the console uses, so the landing page can
 * never drift from the data it describes.
 */

const PIPELINE = [
  { icon: Flag, step: "01", title: "Citizens report", body: "Location, depth, description and a photo in under a minute. No account, no app install." },
  { icon: Tags, step: "02", title: "Rules classify", body: "A deterministic classifier assigns category, severity and confidence — provider and model version always shown." },
  { icon: Layers, step: "03", title: "Events merge", body: "Near-duplicate reports cluster by time and space into a single urban event." },
  { icon: CloudRain, step: "04", title: "Evidence fuses", body: "Rainfall, drains, pumps, jurisdiction and recurrence history enrich each event." },
  { icon: Radar, step: "05", title: "Risk is scored", body: "A transparent 7-factor rule model returns 0-100 with the contribution of every factor." },
  { icon: Network, step: "06", title: "Agencies routed", body: "The accountable owner is assigned through explainable rules, with an escalation path." },
  { icon: ClipboardCheck, step: "07", title: "Field verifies", body: "Crews close the loop with photos and depth readings. Recurrence reopens the event." },
] as const;

const GALLERY = [
  {
    title: "Overflowing storm drain",
    caption: "Drain overflow · classified DRAIN_OVERFLOW",
    webp: "/img/drain-overflow.webp",
    png: "/img/drain-overflow.png",
    alt: "Storm drain overflowing onto a street during heavy rain (synthetic demo image)",
  },
  {
    title: "Waterlogged street",
    caption: "Standing water · classified WATERLOGGING",
    webp: "/img/street-flood.webp",
    png: "/img/street-flood.png",
    alt: "Street covered with standing rain water (synthetic demo image)",
  },
  {
    title: "Flooded underpass",
    caption: "Underpass ponding · classified WATERLOGGING",
    webp: "/img/ito-underpass.webp",
    png: "/img/ito-underpass.png",
    alt: "Road underpass flooded with standing water (synthetic demo image)",
  },
] as const;

const VIEWS: { id: ViewId; label: string; body: string; icon: typeof Droplets; group: string }[] = [
  { id: "command", label: "Command Center", body: "Live KPIs, ops map, rainfall context and the event queue on one screen.", icon: Droplets, group: "Operations" },
  { id: "map", label: "Waterlogging Map", body: "Every event on a keyless map. Filter by risk, status, category and time.", icon: MapPin, group: "Operations" },
  { id: "event", label: "Event Dossier", body: "The full evidence chain for one event, from first report to field closure.", icon: FileSearch, group: "Operations" },
  { id: "investigate", label: "Investigation Tools", body: "Classification, duplicate clustering and risk advisory with full provenance.", icon: Activity, group: "Evidence flow" },
  { id: "responsibility", label: "Responsibility", body: "Which agency owns which asset, and the routing chain that decided it.", icon: Network, group: "Evidence flow" },
  { id: "verify", label: "Field Verification", body: "Close the loop from routed action to verified ground truth.", icon: ClipboardCheck, group: "Evidence flow" },
  { id: "report", label: "Citizen Report", body: "A five-step guided report with a tracking reference you can follow.", icon: Flag, group: "Evidence flow" },
  { id: "analytics", label: "Research & Analytics", body: "Does multi-source evidence beat complaint counting? Measured, not asserted.", icon: BarChart3, group: "Research" },
  { id: "health", label: "Data & Model Health", body: "Provenance, missingness, model runs and endpoint checks in plain language.", icon: Activity, group: "Research" },
];

export function LandingView() {
  const [menuOpen, setMenuOpen] = useState(false);
  const reduce = useReducedMotion();

  const go = (view: ViewId) => {
    setMenuOpen(false);
    navigate(view);
  };

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-background">
      {/* ---------------- site header ---------------- */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-ink-950/85 backdrop-blur-xl supports-[backdrop-filter]:bg-ink-950/70">
        <div className="content-wrap flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => go("landing")}
            className="flex items-center gap-2.5 rounded-lg text-left"
            aria-label="JalSetu home"
          >
            <img src={assetPath("/img/jalsetu-mark.svg")} alt="" width={32} height={32} className="size-8 shrink-0 rounded-[9px]" />
            <span className="min-w-0">
              <span className="block font-display text-[0.98rem] font-bold leading-none tracking-tight text-foreground">JalSetu</span>
              <span className="mt-0.5 hidden text-[0.6rem] leading-tight text-muted-foreground xs:block">Delhi Waterlogging Intelligence</span>
            </span>
          </button>

          <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 lg:flex">
            {(["command", "map", "report", "analytics"] as ViewId[]).map((id) => {
              const item = VIEWS.find((v) => v.id === id)!;
              return (
                <button
                  key={id}
                  onClick={() => go(id)}
                  className="rounded-lg px-3 py-2 text-[0.82rem] font-medium text-slate-600 transition-colors hover:bg-ink-850 hover:text-foreground"
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <button
              onClick={() => go("command")}
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-hairline bg-ink-900 px-3.5 text-[0.8rem] font-semibold text-foreground transition-colors hover:border-aqua/40 hover:bg-ink-850 sm:inline-flex"
            >
              Open console
              <ArrowRight className="size-3.5 text-aqua" aria-hidden />
            </button>
            <button
              onClick={() => go("report")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-aqua px-3.5 text-[0.8rem] font-semibold text-ink-950 transition-colors hover:bg-aqua-dim"
            >
              <Flag className="size-3.5" aria-hidden />
              Report
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="grid size-9 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-ink-850 hover:text-foreground lg:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav aria-label="Mobile" className="border-t border-hairline bg-ink-900 px-4 py-3 lg:hidden">
            <ul className="grid gap-1">
              {VIEWS.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => go(v.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-ink-850 hover:text-foreground"
                  >
                    <v.icon className="size-4 shrink-0 text-slate-500" aria-hidden />
                    {v.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {/* ---------------- hero ---------------- */}
      <section className="relative">
        <div className="ink-atmosphere" aria-hidden />
        <div className="ink-grid" aria-hidden />

        <div className="content-wrap relative px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
          <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full border border-aqua/25 bg-aqua/[0.07] px-3 py-1.5 micro-label !text-[0.58rem] !text-aqua-dim">
                  <PulseDot size={6} color="bg-aqua" />
                  Research prototype · Delhi pilot
                </span>
              </Reveal>

              <Reveal delay={0.06}>
                <h1 className="mt-6 font-display text-[2.6rem] font-bold leading-[1.03] tracking-[-0.03em] text-foreground sm:text-6xl lg:text-[4.1rem]">
                  Every flooded street in Delhi,{" "}
                  <span className="text-aqua-gradient">scored and routed</span> before the water rises.
                </h1>
              </Reveal>

              <Reveal delay={0.12}>
                <p className="mt-6 max-w-xl text-[1.02rem] leading-relaxed text-slate-600 sm:text-lg">
                  JalSetu turns scattered citizen complaints, rainfall gauges, drainage
                  assets and field reports into explainable urban events — then routes
                  each one to the agency that can actually fix it, and verifies the fix
                  on the ground.
                </p>
              </Reveal>

              <Reveal delay={0.18}>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => go("command")}
                    className="group inline-flex h-12 items-center gap-2 rounded-xl bg-aqua px-6 text-[0.92rem] font-semibold text-ink-950 transition-all hover:bg-aqua-dim hover:shadow-[0_0_28px_-6px_rgba(45,212,191,0.5)]"
                  >
                    Open the command center
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </button>
                  <button
                    onClick={() => go("map")}
                    className="inline-flex h-12 items-center gap-2 rounded-xl border border-hairline bg-ink-900/70 px-6 text-[0.92rem] font-semibold text-foreground backdrop-blur transition-colors hover:border-aqua/40 hover:bg-ink-850"
                  >
                    <MapPin className="size-4 text-aqua" aria-hidden />
                    Explore the map
                  </button>
                </div>
              </Reveal>

              <Reveal delay={0.24}>
                <p className="mt-5 flex items-center gap-2 text-[0.72rem] text-slate-500">
                  <ShieldCheck className="size-3.5 shrink-0 text-emerald-500" aria-hidden />
                  Fully static demo · no backend, no API keys, no tracking
                </p>
              </Reveal>
            </div>

            <HeroConsole />
          </div>
        </div>
      </section>

      {/* ---------------- live numbers ---------------- */}
      <LiveBand />

      {/* ---------------- the problem ---------------- */}
      <section className="content-wrap px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <p className="micro-label !text-aqua-dim">The problem</p>
          <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.6rem]">
            Waterlogging is not a data problem. It is a{" "}
            <span className="text-slate-500">coordination</span> problem.
          </h2>
        </Reveal>

        <Stagger className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: AlertTriangle,
              title: "Complaints are not incidents",
              body: "Counting reports measures who has a phone, not where the water is. Busy junctions drown out the drains that actually back up every monsoon.",
            },
            {
              icon: Building2,
              title: "Ownership is ambiguous",
              body: "A blocked drain, a low road, a failing pump and an encroachment sit with different agencies. Without an explicit chain, an event simply floats.",
            },
            {
              icon: Clock3,
              title: "Closure is unverified",
              body: "If nobody checks the ground, a cleared ticket and an unfixed street look identical. Recurrence is the only honest audit, and it rarely happens.",
            },
          ].map((c) => (
            <StaggerItem key={c.title}>
              <SpotlightCard
                className="panel card-hover h-full rounded-2xl p-6"
                spotlightColor="rgba(45, 212, 191, 0.07)"
              >
                <span className="grid size-11 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-500">
                  <c.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-[1.05rem] font-semibold text-foreground">{c.title}</h3>
                <p className="mt-2 text-[0.88rem] leading-relaxed text-slate-600">{c.body}</p>
              </SpotlightCard>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ---------------- pipeline ---------------- */}
      <section className="relative border-y border-hairline bg-ink-900/40">
        <div className="content-wrap px-4 py-16 sm:px-6 sm:py-24">
          <Reveal>
            <p className="micro-label !text-aqua-dim">How it works</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.4rem]">
              Seven steps from a doorstep complaint to a verified fix.
            </h2>
            <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-slate-600">
              Every step is a screen in the console. Nothing is a black box: the
              classification, the clustering, the risk factors and the routing
              decision are all inspectable.
            </p>
          </Reveal>

          <Stagger className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((p) => (
              <StaggerItem key={p.step} className="bg-ink-900 p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg border border-aqua/25 bg-aqua/10 text-aqua">
                    <p.icon className="size-4" aria-hidden />
                  </span>
                  <span className="data-mono text-[0.7rem] text-slate-500">{p.step}</span>
                </div>
                <h3 className="mt-4 font-display text-[0.98rem] font-semibold text-foreground">{p.title}</h3>
                <p className="mt-1.5 text-[0.84rem] leading-relaxed text-slate-600">{p.body}</p>
              </StaggerItem>
            ))}
            <StaggerItem className="flex flex-col justify-center bg-ink-900 p-6">
              <p className="font-display text-[0.98rem] font-semibold text-foreground">
                Then it loops.
              </p>
              <p className="mt-1.5 text-[0.84rem] leading-relaxed text-slate-600">
                A verified closure that floods again reopens the same event with its
                full history intact.
              </p>
              <button
                onClick={() => go("map")}
                className="mt-4 inline-flex items-center gap-1.5 self-start text-[0.82rem] font-semibold text-aqua transition-colors hover:text-aqua-dim"
              >
                See it on the map
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      {/* ---------------- capabilities ---------------- */}
      <section className="content-wrap px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <p className="micro-label !text-aqua-dim">The console</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.4rem]">
            Nine views, one shared truth.
          </h2>
        </Reveal>

        {(["Operations", "Evidence flow", "Research"] as const).map((group) => (
          <div key={group} className="mt-10">
            <p className="micro-label">{group}</p>
            <Stagger className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {VIEWS.filter((v) => v.group === group).map((v) => (
                <StaggerItem key={v.id}>
                  <button
                    onClick={() => go(v.id)}
                    className="panel card-hover group flex h-full w-full flex-col rounded-xl p-5 text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <v.icon className="size-4 shrink-0 text-aqua" aria-hidden />
                      <span className="font-display text-[0.92rem] font-semibold text-foreground">{v.label}</span>
                      <ArrowRight className="ml-auto size-3.5 shrink-0 text-slate-500 transition-all group-hover:translate-x-0.5 group-hover:text-aqua" aria-hidden />
                    </span>
                    <span className="mt-2 text-[0.83rem] leading-relaxed text-slate-600">{v.body}</span>
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        ))}
      </section>

      {/* ---------------- field evidence gallery ---------------- */}
      <section className="content-wrap px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <p className="micro-label !text-aqua-dim">Field evidence</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.4rem]">
            What the classifier actually sees.
          </h2>
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-slate-600">
            Report photos arrive as evidence and are sorted into the same
            categories the console uses. These are illustrative synthetic
            images from the demo dataset — no real citizens or streets.
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-4 sm:grid-cols-3">
          {GALLERY.map((g) => (
            <StaggerItem key={g.webp}>
              <figure className="group panel h-full overflow-hidden rounded-2xl">
                <div className="relative aspect-16/9 overflow-hidden bg-ink-850">
                  <picture>
                    <source srcSet={assetSrcSet(`${g.webp} 560w`)} type="image/webp" sizes="(min-width: 640px) 33vw, 100vw" />
                    <img
                      src={assetPath(g.png)}
                      alt={g.alt}
                      width={560}
                      height={320}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </picture>
                  <div className="absolute inset-0 bg-linear-to-t from-ink-950/75 via-ink-950/10 to-transparent" aria-hidden />
                  <span className="micro-label absolute bottom-2.5 left-3 !text-[0.5rem] text-aqua-dim">
                    synthetic · demo
                  </span>
                </div>
                <figcaption className="px-4 py-3">
                  <span className="block text-[0.86rem] font-semibold text-foreground">{g.title}</span>
                  <span className="mt-0.5 block text-[0.72rem] text-slate-500">{g.caption}</span>
                </figcaption>
              </figure>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ---------------- evidence ---------------- */}
      <section className="relative border-y border-hairline bg-ink-900/40">
        <div className="content-wrap grid gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <Reveal>
            <p className="micro-label !text-aqua-dim">Does it actually work?</p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.4rem]">
              We measured it instead of claiming it.
            </h2>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-slate-600">
              The console scores hotspots two ways against the same seeded ground
              truth: the current common practice of ranking by complaint frequency,
              and the proposed evidence-integrated ranking. Same candidates, same
              labels — so any difference belongs to the scoring function.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                "Every metric is computed in the browser from the committed dataset",
                "Precision, recall, F1, AUC and spatial hit rate, reported as-is",
                "Routing accuracy published with its mismatches, not hidden",
                "Synthetic demo evaluation, labelled everywhere it appears",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[0.88rem] text-slate-600">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <button
              onClick={() => go("analytics")}
              className="group mt-7 inline-flex h-11 items-center gap-2 rounded-xl border border-hairline bg-ink-900 px-5 text-[0.88rem] font-semibold text-foreground transition-colors hover:border-aqua/40 hover:bg-ink-850"
            >
              Read the evaluation
              <ArrowRight className="size-4 text-aqua transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          </Reveal>

          <Reveal delay={0.1}>
            <EvidenceCard />
          </Reveal>
        </div>
      </section>

      {/* ---------------- final CTA ---------------- */}
      <section className="relative">
        <div className="ink-atmosphere" aria-hidden />
        <div className="content-wrap relative px-4 py-20 text-center sm:px-6 sm:py-28">
          <Reveal>
            <h2 className="mx-auto max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
              See standing water on your street right now?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[1rem] leading-relaxed text-slate-600">
              File a report in under a minute, then follow it as it is classified,
              merged, routed and verified. No account needed.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => go("report")}
                className="group inline-flex h-12 items-center gap-2 rounded-xl bg-aqua px-6 text-[0.92rem] font-semibold text-ink-950 transition-all hover:bg-aqua-dim hover:shadow-[0_0_28px_-6px_rgba(45,212,191,0.5)]"
              >
                <Flag className="size-4" aria-hidden />
                Report waterlogging
              </button>
              <button
                onClick={() => go("command")}
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-hairline bg-ink-900/70 px-6 text-[0.92rem] font-semibold text-foreground backdrop-blur transition-colors hover:border-aqua/40 hover:bg-ink-850"
              >
                Open the command center
                <ArrowRight className="size-4 text-aqua" aria-hidden />
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <LandingFooter onNavigate={go} />
    </div>
  );
}

/* ------------------------------------------------------------------ hero card */

function HeroConsole() {
  const reduce = useReducedMotion();
  const { data } = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview").then((r) => r.data),
    staleTime: 60_000,
  });

  const bands = [
    { label: "Active events", value: data?.counts.activeEvents, tint: "bg-aqua" },
    { label: "High risk", value: data?.counts.highRisk, tint: "bg-red-500" },
    { label: "In the field", value: data?.counts.inField, tint: "bg-emerald-500" },
    { label: "Rain 24h", value: data ? Math.round(data.rainfall.pilot24hMm) : null, suffix: "mm", tint: "bg-blue-600" },
  ];

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.2, ease: [0.21, 0.47, 0.32, 0.98] }}
      className="relative"
    >
      <div
        className="pointer-events-none absolute -inset-6 rounded-[2rem] opacity-70 blur-2xl"
        style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(45,212,191,0.18), transparent 70%)" }}
        aria-hidden
      />
      <div className="panel relative overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 hairline-b px-4 py-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-red-500/70" />
            <span className="size-2.5 rounded-full bg-amber-500/70" />
            <span className="size-2.5 rounded-full bg-emerald-500/70" />
          </span>
          <span className="ml-1 micro-label !text-[0.55rem]">delhi pilot · live</span>
          <span className="ml-auto flex items-center gap-1.5 micro-label !text-[0.55rem] !text-aqua-dim">
            <PulseDot size={5} color="bg-aqua" />
            streaming
          </span>
        </div>

        <div className="grid grid-cols-2 gap-px bg-hairline">
          {bands.map((b) => (
            <div key={b.label} className="bg-ink-900 px-4 py-4">
              <p className="micro-label !text-[0.53rem]">{b.label}</p>
              <p className="mt-1.5 flex items-baseline gap-1 font-display text-2xl font-bold text-foreground">
                {b.value == null ? <span className="inline-block h-7 w-12 rounded shimmer" /> : <CountUp value={b.value} />}
                {b.suffix && <span className="text-[0.7rem] font-medium text-slate-500">{b.suffix}</span>}
              </p>
              <span className={cn("mt-2 block h-1 w-full overflow-hidden rounded-full bg-ink-800", b.tint)} style={{ opacity: 0.25 }} />
            </div>
          ))}
        </div>

        <div className="hairline-t px-4 py-3.5">
          <p className="micro-label !text-[0.53rem]">risk distribution</p>
          <div className="mt-2.5 space-y-2.5">
            {[
              { band: "Critical", cls: "bg-red-500", w: 18 },
              { band: "High", cls: "bg-orange-500", w: 34 },
              { band: "Moderate", cls: "bg-amber-500", w: 62 },
              { band: "Low", cls: "bg-slate-500", w: 88 },
            ].map((r, i) => (
              <div key={r.band} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[0.68rem] text-slate-500">{r.band}</span>
                <AnimatedProgress value={r.w} className="h-1.5 flex-1 bg-ink-800" fillClassName={r.cls} delay={0.3 + i * 0.09} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* --------------------------------------------------------------- live numbers */

function LiveBand() {
  const { data } = useQuery({
    queryKey: ["hotspots"],
    queryFn: () => apiGet<HotspotResponse>("/api/hotspots").then((r) => r.data),
    staleTime: 120_000,
  });
  const { data: overview } = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview").then((r) => r.data),
    staleTime: 60_000,
  });

  const stats = [
    { value: overview?.counts.totalEvents, label: "Urban events modelled", suffix: "" },
    { value: overview?.counts.activeEvents, label: "Active right now", suffix: "" },
    { value: data?.computed.length, label: "Hotspots computed", suffix: "" },
    { value: overview?.responseByAgency.length, label: "Agencies in the loop", suffix: "" },
    { value: overview?.pilot.jurisdictions.length, label: "Pilot jurisdictions", suffix: "" },
  ];

  return (
    <section className="border-y border-hairline bg-ink-900/30" aria-label="Pilot at a glance">
      <div className="content-wrap grid grid-cols-2 gap-px bg-hairline px-0 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.05} className="bg-ink-900 px-5 py-7 text-center">
            <p className="font-display text-3xl font-bold text-foreground">
              {s.value == null ? <span className="inline-block h-8 w-10 rounded shimmer align-middle" /> : <CountUp value={s.value} />}
              {s.suffix}
            </p>
            <p className="mt-1.5 text-[0.72rem] leading-tight text-slate-500">{s.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ evidence */

function EvidenceCard() {
  const baseline = useQuery({
    queryKey: ["analytics", "baseline"],
    queryFn: () => apiGet<{ metrics: { f1: number; auc: number } }>("/api/analytics/baseline").then((r) => r.data),
    staleTime: 300_000,
  });
  const proposed = useQuery({
    queryKey: ["analytics", "proposed"],
    queryFn: () => apiGet<{ metrics: { f1: number; auc: number } }>("/api/analytics/proposed").then((r) => r.data),
    staleTime: 300_000,
  });

  const rows = [
    { key: "F1 score", base: baseline.data?.metrics.f1, prop: proposed.data?.metrics.f1, better: "higher" as const },
    { key: "AUC", base: baseline.data?.metrics.auc, prop: proposed.data?.metrics.auc, better: "higher" as const },
  ];

  return (
    <div className="panel rounded-2xl p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-[0.95rem] font-semibold text-foreground">Hotspot detection</p>
          <p className="mt-0.5 text-[0.74rem] text-slate-500">Complaint counting vs. evidence fusion</p>
        </div>
        <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 micro-label !text-[0.52rem] !text-amber-600">
          synthetic demo eval
        </span>
      </div>

      <div className="mt-6 space-y-5">
        {rows.map((r) => {
          const gain =
            r.base != null && r.prop != null ? Math.round((r.prop - r.base) * 1000) / 10 : null;
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.82rem] font-medium text-slate-700">{r.key}</span>
                <span className="data-mono text-[0.78rem] text-slate-500">
                  {r.base != null ? r.base.toFixed(3) : "—"} <span className="px-1 text-slate-400">→</span>{" "}
                  <span className="text-aqua">{r.prop != null ? r.prop.toFixed(3) : "—"}</span>
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                <MeterRow label="Baseline" value={r.base} cls="bg-slate-500" />
                <MeterRow label="Proposed" value={r.prop} cls="bg-aqua" />
              </div>
              {gain != null && (
                <p className="mt-2 text-[0.72rem] text-slate-500">
                  {gain >= 0 ? (
                    <span className="font-semibold text-emerald-500">+{gain.toFixed(1)} points</span>
                  ) : (
                    <span className="font-semibold text-amber-500">{gain.toFixed(1)} points</span>
                  )}{" "}
                  attributable to the scoring function, not the data.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 border-t border-hairline pt-4 text-[0.72rem] leading-relaxed text-slate-500">
        Figures are a synthetic demonstration evaluation computed in your browser
        against a seeded dataset with known ground truth. They are not measured
        real-world performance.
      </p>
    </div>
  );
}

function MeterRow({ label, value, cls }: { label: string; value?: number; cls: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[0.66rem] text-slate-500">{label}</span>
      <AnimatedProgress
        value={(value ?? 0) * 100}
        className="h-2 flex-1 bg-ink-800"
        fillClassName={cls}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- footer */

function LandingFooter({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const groups = [
    {
      title: "Operations",
      links: [
        { label: "Command Center", view: "command" as ViewId },
        { label: "Waterlogging Map", view: "map" as ViewId },
        { label: "Event Dossier", view: "event" as ViewId },
      ],
    },
    {
      title: "Evidence flow",
      links: [
        { label: "Investigation Tools", view: "investigate" as ViewId },
        { label: "Responsibility", view: "responsibility" as ViewId },
        { label: "Field Verification", view: "verify" as ViewId },
        { label: "Citizen Report", view: "report" as ViewId },
      ],
    },
    {
      title: "Research",
      links: [
        { label: "Research & Analytics", view: "analytics" as ViewId },
        { label: "Data & Model Health", view: "health" as ViewId },
      ],
    },
  ];

  return (
    <footer className="border-t border-hairline bg-ink-900/50">
      <div className="content-wrap grid gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <img src={assetPath("/img/jalsetu-mark.svg")} alt="" width={30} height={30} className="size-[30px] rounded-lg" />
            <span className="font-display text-[0.95rem] font-bold text-foreground">JalSetu</span>
          </div>
          <p className="mt-3 max-w-xs text-[0.82rem] leading-relaxed text-slate-600">
            Cross-agency waterlogging intelligence for a bounded Delhi pilot.
            A research prototype, built to show what explainable urban event
            intelligence looks like end to end.
          </p>
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-[0.72rem] leading-relaxed text-amber-600">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            Synthetic demonstration data. Not a deployed government system.
          </p>
        </div>

        {groups.map((g) => (
          <div key={g.title}>
            <p className="micro-label">{g.title}</p>
            <ul className="mt-3 space-y-1">
              {g.links.map((l) => (
                <li key={l.label}>
                  <button
                    onClick={() => onNavigate(l.view)}
                    className="rounded px-1 py-1.5 text-left text-[0.82rem] text-slate-600 transition-colors hover:text-aqua"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-hairline">
        <div className="content-wrap flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-[0.7rem] text-slate-500 sm:px-6">
          <span>© 2026 JalSetu Research Prototype</span>
          <span className="text-slate-400">Delhi, India</span>
          <span className="hidden xs:inline">Datasets licensed CC-BY-4.0</span>
          <a
            href={assetPath("/llms.txt")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded px-1 py-1 transition-colors hover:text-aqua"
          >
            <FileText className="size-3" aria-hidden />
            For AI assistants
          </a>
          <span className="ml-auto data-mono hidden lg:inline">No backend · no API keys · no tracking</span>
        </div>
      </div>
    </footer>
  );
}
