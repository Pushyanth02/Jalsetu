"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, FileText, Flag, MapPin, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { navigate, type ViewId } from "@/lib/client/store";
import { assetPath, assetSrcSet } from "@/lib/client/assets";
import { apiGet, type OverviewResponse, type HotspotResponse } from "@/lib/client/api";
import { Reveal, Stagger, StaggerItem, CountUp, PulseDot, AnimatedProgress } from "@/components/motion/kit";
import { RISK_META } from "@/components/app/shared/domain";

/**
 * LANDING — the front door of the Monsoon ink site.
 *
 * Sits outside the ops shell (no TopBar / NavRail): this is the public face,
 * the console is the product behind it. Every number on this page is read
 * from the same in-browser API the console uses, so the landing page can
 * never drift from the data it describes.
 *
 * Design rules for this page: no ambient orbs, no background grids, no
 * gradient headlines, no card-grid of "features". It is laid out like a
 * document — rules, an index, a ledger — and the only accent is one aqua rule.
 */

type Group = "Operations" | "Evidence flow" | "Research";

const GROUPS: Group[] = ["Operations", "Evidence flow", "Research"];

const PROBLEMS = [
  {
    title: "Complaints are not incidents",
    body: "Counting reports measures who has a phone, not where the water is. Busy junctions drown out the drains that actually back up every monsoon.",
  },
  {
    title: "Ownership is ambiguous",
    body: "A blocked drain, a low road, a failing pump and an encroachment sit with different agencies. Without an explicit chain, an event simply floats.",
  },
  {
    title: "Closure is unverified",
    body: "If nobody checks the ground, a cleared ticket and an unfixed street look identical. Recurrence is the only honest audit, and it rarely happens.",
  },
] as const;

const PIPELINE = [
  { step: "01", title: "Citizens report", body: "Location, depth, description and a photo in under a minute. No account, no app install." },
  { step: "02", title: "Rules classify", body: "A deterministic classifier assigns category, severity and confidence. Provider and model version are always shown." },
  { step: "03", title: "Events merge", body: "Near-duplicate reports cluster by time and space into a single urban event." },
  { step: "04", title: "Evidence fuses", body: "Rainfall, drains, pumps, jurisdiction and recurrence history enrich each event." },
  { step: "05", title: "Risk is scored", body: "A transparent 7-factor rule model returns 0-100 with the contribution of every factor." },
  { step: "06", title: "Agencies routed", body: "The accountable owner is assigned through explainable rules, with an escalation path." },
  { step: "07", title: "Field verifies", body: "Crews close the loop with photos and depth readings. Recurrence reopens the event." },
] as const;

const GALLERY = [
  {
    title: "Overflowing storm drain",
    klass: "DRAIN_OVERFLOW",
    avif: "/img/drain-overflow.avif",
    webp: "/img/drain-overflow.webp",
    png: "/img/drain-overflow.png",
    alt: "Storm drain overflowing onto a street during heavy rain (synthetic demo image)",
  },
  {
    title: "Waterlogged street",
    klass: "WATERLOGGING",
    avif: "/img/street-flood.avif",
    webp: "/img/street-flood.webp",
    png: "/img/street-flood.png",
    alt: "Street covered with standing rain water (synthetic demo image)",
  },
  {
    title: "Flooded underpass",
    klass: "WATERLOGGING",
    avif: "/img/ito-underpass.avif",
    webp: "/img/ito-underpass.webp",
    png: "/img/ito-underpass.png",
    alt: "Road underpass flooded with standing water (synthetic demo image)",
  },
] as const;

const VIEWS: { id: ViewId; label: string; body: string; group: Group }[] = [
  { id: "command", label: "Command Center", body: "Live KPIs, ops map, rainfall context and the event queue on one screen.", group: "Operations" },
  { id: "map", label: "Waterlogging Map", body: "Every event on a keyless map. Filter by risk, status, category and time.", group: "Operations" },
  { id: "event", label: "Event Dossier", body: "The full evidence chain for one event, from first report to field closure.", group: "Operations" },
  { id: "investigate", label: "Investigation Tools", body: "Classification, duplicate clustering and risk advisory with full provenance.", group: "Evidence flow" },
  { id: "responsibility", label: "Responsibility", body: "Which agency owns which asset, and the routing chain that decided it.", group: "Evidence flow" },
  { id: "verify", label: "Field Verification", body: "Close the loop from routed action to verified ground truth.", group: "Evidence flow" },
  { id: "report", label: "Citizen Report", body: "A five-step guided report with a tracking reference you can follow.", group: "Evidence flow" },
  { id: "analytics", label: "Research & Analytics", body: "Does multi-source evidence beat complaint counting? Measured, not asserted.", group: "Research" },
  { id: "health", label: "Data & Model Health", body: "Provenance, missingness, model runs and endpoint checks in plain language.", group: "Research" },
];

const EVALUATION_NOTES = [
  "Every metric is computed in the browser from the committed dataset",
  "Precision, recall, F1, AUC and spatial hit rate, reported as-is",
  "Routing accuracy published with its mismatches, not hidden",
  "Synthetic demo evaluation, labelled everywhere it appears",
];

/** Section eyebrow: one aqua rule, one mono label. Used by every section. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="signal-rule" aria-hidden />
      <p className="mt-3.5 micro-label">{children}</p>
    </>
  );
}

export function LandingView() {
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (view: ViewId) => {
    setMenuOpen(false);
    navigate(view);
  };

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-background">
      {/* ---------------- site header ---------------- */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-ink-950/92 backdrop-blur-md supports-[backdrop-filter]:bg-ink-950/80">
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
              className="hidden h-9 items-center rounded-lg border border-hairline bg-ink-900 px-3.5 text-[0.8rem] font-semibold text-foreground transition-colors hover:border-aqua/40 hover:bg-ink-850 sm:inline-flex"
            >
              Open console
            </button>
            <button
              onClick={() => go("report")}
              className="inline-flex h-9 items-center rounded-lg bg-aqua px-3.5 text-[0.8rem] font-semibold text-ink-950 transition-colors hover:bg-aqua-dim"
            >
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
                    className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-ink-850 hover:text-foreground"
                  >
                    {v.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {/* ---------------- hero ---------------- */}
      <section className="border-b border-hairline">
        <div className="content-wrap grid items-start gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <Reveal>
              <p className="flex items-center gap-2 micro-label !text-aqua-dim">
                <PulseDot size={6} color="bg-aqua" />
                Research prototype · Delhi pilot
              </p>
            </Reveal>

            <Reveal delay={0.06}>
              <h1 className="mt-6 font-display text-[2.6rem] font-bold leading-[1.03] tracking-[-0.03em] text-foreground sm:text-6xl lg:text-[4.1rem]">
                Every flooded street in Delhi,{" "}
                <span className="text-aqua-dim">scored and routed</span> before the water rises.
              </h1>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mt-6 max-w-xl text-[1.02rem] leading-relaxed text-slate-600 sm:text-lg">
                JalSetu turns scattered citizen complaints, rainfall gauges, drainage
                assets and field reports into explainable urban events, routes each one
                to the agency that can actually fix it, and verifies the fix on the
                ground.
              </p>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => go("command")}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-aqua px-6 text-[0.92rem] font-semibold text-ink-950 transition-colors hover:bg-aqua-dim"
                >
                  Open the command center
                  <ArrowRight className="size-4" aria-hidden />
                </button>
                <button
                  onClick={() => go("map")}
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-hairline bg-ink-900 px-6 text-[0.92rem] font-semibold text-foreground transition-colors hover:border-aqua/40 hover:bg-ink-850"
                >
                  <MapPin className="size-4 text-aqua" aria-hidden />
                  Explore the map
                </button>
              </div>
            </Reveal>

            <Reveal delay={0.24}>
              <p className="mt-6 data-mono text-[0.68rem] leading-relaxed text-slate-500">
                static demo · no backend · no API keys · no tracking
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.16}>
            <LiveReadout />
          </Reveal>
        </div>
      </section>

      {/* ---------------- live numbers ---------------- */}
      <LiveBand />

      {/* ---------------- the problem ---------------- */}
      <section className="content-wrap px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <SectionLabel>The problem</SectionLabel>
          <h2 className="mt-4 max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.6rem]">
            Three failures keep the same drains under water every monsoon.
          </h2>
        </Reveal>

        <Stagger className="mt-10 border-t border-hairline">
          {PROBLEMS.map((c, i) => (
            <StaggerItem
              key={c.title}
              className="grid gap-x-6 gap-y-2 border-b border-hairline py-6 sm:grid-cols-[3rem_17rem_1fr] sm:py-7"
            >
              <span className="data-mono text-[0.72rem] text-aqua/70">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="font-display text-[1.05rem] font-semibold text-foreground">{c.title}</h3>
              <p className="text-[0.9rem] leading-relaxed text-slate-600">{c.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ---------------- pipeline ---------------- */}
      <section className="border-y border-hairline bg-ink-900/40">
        <div className="content-wrap px-4 py-16 sm:px-6 sm:py-24">
          <Reveal>
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.4rem]">
              Seven steps from a doorstep complaint to a verified fix.
            </h2>
            <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-slate-600">
              Every step is a screen in the console. Nothing is a black box: the
              classification, the clustering, the risk factors and the routing
              decision are all inspectable.
            </p>
          </Reveal>

          <Stagger className="mt-12 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((p) => (
              <StaggerItem key={p.step} className="bg-ink-900 p-6">
                <span className="data-mono text-[0.72rem] text-aqua">{p.step}</span>
                <h3 className="mt-3 font-display text-[0.98rem] font-semibold text-foreground">{p.title}</h3>
                <p className="mt-1.5 text-[0.84rem] leading-relaxed text-slate-600">{p.body}</p>
              </StaggerItem>
            ))}
            <StaggerItem className="flex flex-col justify-center bg-ink-900 p-6">
              <p className="font-display text-[0.98rem] font-semibold text-foreground">Then it loops.</p>
              <p className="mt-1.5 text-[0.84rem] leading-relaxed text-slate-600">
                A verified closure that floods again reopens the same event with its
                full history intact.
              </p>
              <button
                onClick={() => go("map")}
                className="mt-4 self-start text-[0.82rem] font-semibold text-aqua transition-colors hover:text-aqua-dim"
              >
                See it on the map
              </button>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      {/* ---------------- capabilities ---------------- */}
      <section className="content-wrap px-4 py-16 sm:px-6 sm:py-24">
        <Reveal>
          <SectionLabel>The console</SectionLabel>
          <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.4rem]">
            Nine views, one shared truth.
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-3">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="border-b border-hairline pb-2.5 micro-label">{group}</p>
              <Stagger className="mt-1">
                {VIEWS.filter((v) => v.group === group).map((v) => (
                  <StaggerItem key={v.id}>
                    <button
                      onClick={() => go(v.id)}
                      className="group block w-full border-b border-hairline py-3.5 text-left"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-display text-[0.94rem] font-semibold text-foreground transition-colors group-hover:text-aqua-dim">
                          {v.label}
                        </span>
                        <span className="data-mono shrink-0 text-[0.62rem] text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
                          open
                        </span>
                      </span>
                      <span className="mt-1 block text-[0.82rem] leading-relaxed text-slate-600">{v.body}</span>
                    </button>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- field evidence gallery ---------------- */}
      <section className="border-y border-hairline bg-ink-900/40">
        <div className="content-wrap px-4 py-16 sm:px-6 sm:py-24">
          <Reveal>
            <SectionLabel>Field evidence</SectionLabel>
            <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.4rem]">
              What the classifier actually sees.
            </h2>
            <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-slate-600">
              Report photos arrive as evidence and are sorted into the same
              categories the console uses. These are illustrative synthetic
              images from the demo dataset. No real citizens or streets.
            </p>
          </Reveal>

          <Stagger className="mt-10 grid gap-5 sm:grid-cols-3">
            {GALLERY.map((g) => (
              <StaggerItem key={g.webp}>
                <figure className="panel h-full overflow-hidden rounded-xl">
                  <div className="relative aspect-16/9 overflow-hidden border-b border-hairline bg-ink-850">
                    <picture>
                      <source srcSet={assetSrcSet(`${g.avif} 560w`)} type="image/avif" sizes="(min-width: 640px) 33vw, 100vw" />
                      <source srcSet={assetSrcSet(`${g.webp} 560w`)} type="image/webp" sizes="(min-width: 640px) 33vw, 100vw" />
                      <img
                        src={assetPath(g.png)}
                        alt={g.alt}
                        width={560}
                        height={320}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </picture>
                  </div>
                  <figcaption className="px-4 py-3.5">
                    <span className="block text-[0.88rem] font-semibold text-foreground">{g.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-slate-500">
                      <span className="data-mono text-[0.66rem] text-aqua-dim">{g.klass}</span>
                      <span aria-hidden>·</span>
                      <span>synthetic demo</span>
                    </span>
                  </figcaption>
                </figure>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------------- evidence ---------------- */}
      <section className="content-wrap grid gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <Reveal>
          <SectionLabel>Does it actually work?</SectionLabel>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.4rem]">
            We measured it instead of claiming it.
          </h2>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-slate-600">
            The console scores hotspots two ways against the same seeded ground
            truth: the current common practice of ranking by complaint frequency,
            and the proposed evidence-integrated ranking. Same candidates, same
            labels, so any difference belongs to the scoring function.
          </p>

          <dl className="mt-7 border-t border-hairline">
            {EVALUATION_NOTES.map((note, i) => (
              <div key={note} className="flex gap-4 border-b border-hairline py-3">
                <dt className="data-mono shrink-0 text-[0.68rem] text-aqua/70">{String(i + 1).padStart(2, "0")}</dt>
                <dd className="text-[0.88rem] leading-relaxed text-slate-600">{note}</dd>
              </div>
            ))}
          </dl>

          <button
            onClick={() => go("analytics")}
            className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl border border-hairline bg-ink-900 px-5 text-[0.88rem] font-semibold text-foreground transition-colors hover:border-aqua/40 hover:bg-ink-850"
          >
            Read the evaluation
            <ArrowRight className="size-4 text-aqua" aria-hidden />
          </button>
        </Reveal>

        <Reveal delay={0.1}>
          <EvidenceCard />
        </Reveal>
      </section>

      {/* ---------------- final CTA ---------------- */}
      <section className="border-y border-hairline bg-ink-900/40">
        <div className="content-wrap px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
              <div>
                <h2 className="max-w-2xl font-display text-3xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-[2.6rem]">
                  See standing water on your street right now?
                </h2>
                <p className="mt-4 max-w-xl text-[1rem] leading-relaxed text-slate-600">
                  File a report in under a minute, then follow it as it is classified,
                  merged, routed and verified. No account needed.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                <button
                  onClick={() => go("report")}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-aqua px-6 text-[0.92rem] font-semibold text-ink-950 transition-colors hover:bg-aqua-dim"
                >
                  <Flag className="size-4" aria-hidden />
                  Report waterlogging
                </button>
                <button
                  onClick={() => go("command")}
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-hairline bg-ink-900 px-6 text-[0.92rem] font-semibold text-foreground transition-colors hover:border-aqua/40 hover:bg-ink-850"
                >
                  Open the console
                  <ArrowRight className="size-4 text-aqua" aria-hidden />
                </button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <LandingFooter onNavigate={go} />
    </div>
  );
}

/* ------------------------------------------------------------------ readout */

/**
 * Live readout — the product's actual output, not a picture of it: current
 * counts from the same endpoint the console uses, and the highest-scoring
 * events right now, ranked by the real risk score with its band colour.
 */
function LiveReadout() {
  const { data } = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview").then((r) => r.data),
    staleTime: 60_000,
  });

  const bands = [
    { label: "Active events", value: data?.counts.activeEvents },
    { label: "High risk", value: data?.counts.highRisk },
    { label: "In the field", value: data?.counts.inField },
    { label: "Rain 24h", value: data ? Math.round(data.rainfall.pilot24hMm) : null, suffix: "mm" },
  ];

  const ranked = [...(data?.events ?? [])]
    .filter((e) => e.status !== "VERIFIED" && e.status !== "CLOSED")
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 4);

  return (
    <div className="panel overflow-hidden rounded-xl">
      <div className="flex items-center gap-2.5 border-b border-hairline px-4 py-3">
        <PulseDot size={6} color="bg-aqua" />
        <span className="micro-label !text-[0.55rem] !text-aqua-dim">Delhi pilot · live readout</span>
        <span className="ml-auto data-mono text-[0.55rem] text-slate-500">/api/overview</span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-hairline">
        {bands.map((b) => (
          <div key={b.label} className="bg-ink-900 px-4 py-4">
            <p className="micro-label !text-[0.53rem]">{b.label}</p>
            <p className="mt-1.5 flex items-baseline gap-1 font-display text-2xl font-bold text-foreground">
              {b.value == null ? (
                <span className="inline-block h-7 w-12 rounded shimmer" />
              ) : (
                <CountUp value={b.value} />
              )}
              {b.suffix && <span className="text-[0.7rem] font-medium text-slate-500">{b.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-hairline px-4 py-3.5">
        <p className="micro-label !text-[0.53rem]">Highest risk right now</p>

        <ul className="mt-3 space-y-3">
          {data == null &&
            [0, 1, 2].map((i) => <li key={i} className="h-8 rounded shimmer" />)}

          {data != null && ranked.length === 0 && (
            <li className="text-[0.78rem] text-slate-500">No open events in the current snapshot.</li>
          )}

          {ranked.map((e) => (
            <li key={e.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[0.8rem] text-slate-700">{e.title}</span>
                <span className="data-mono shrink-0 text-[0.72rem] text-slate-500">{e.riskScore}</span>
              </div>
              <AnimatedProgress
                value={e.riskScore}
                className="mt-1.5 h-1 bg-ink-800"
                fillClassName={RISK_META[e.riskBand]?.bar ?? "bg-slate-400"}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-hairline px-4 py-2.5">
        <p className="data-mono text-[0.56rem] leading-relaxed text-slate-500">
          {data ? `${data.dataLabel} · snapshot ${data.generatedAt.slice(0, 10)}` : "loading dataset"}
        </p>
      </div>
    </div>
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
    { value: overview?.counts.totalEvents, label: "Urban events modelled" },
    { value: overview?.counts.activeEvents, label: "Active right now" },
    { value: data?.computed.length, label: "Hotspots computed" },
    { value: overview?.responseByAgency.length, label: "Agencies in the loop" },
    { value: overview?.pilot.jurisdictions.length, label: "Pilot jurisdictions" },
  ];

  return (
    <section className="border-b border-hairline bg-ink-900/30" aria-label="Pilot at a glance">
      <div className="content-wrap grid grid-cols-2 gap-px bg-hairline sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.05} className="bg-ink-900 px-5 py-7 text-center">
            <p className="font-display text-3xl font-bold text-foreground">
              {s.value == null ? (
                <span className="inline-block h-8 w-10 rounded shimmer align-middle" />
              ) : (
                <CountUp value={s.value} />
              )}
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
    { key: "F1 score", base: baseline.data?.metrics.f1, prop: proposed.data?.metrics.f1 },
    { key: "AUC", base: baseline.data?.metrics.auc, prop: proposed.data?.metrics.auc },
  ];

  return (
    <div className="panel rounded-xl p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
          const gain = r.base != null && r.prop != null ? Math.round((r.prop - r.base) * 1000) / 10 : null;
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.82rem] font-medium text-slate-700">{r.key}</span>
                <span className="data-mono text-[0.78rem] text-slate-500">
                  {r.base != null ? r.base.toFixed(3) : "n/a"}{" "}
                  <span className="px-1 text-slate-400">→</span>{" "}
                  <span className="text-aqua">{r.prop != null ? r.prop.toFixed(3) : "n/a"}</span>
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
      <AnimatedProgress value={(value ?? 0) * 100} className="h-2 flex-1 bg-ink-800" fillClassName={cls} />
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
            Synthetic demonstration data. Not a deployed government system and not
            an emergency service.
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

      {/* Data handling, stated plainly: this prototype has no server side. */}
      <div className="border-t border-hairline">
        <div className="content-wrap grid gap-3 px-4 py-5 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="micro-label !text-[0.55rem]">Data &amp; privacy</p>
            <p className="mt-1.5 text-[0.72rem] leading-relaxed text-slate-500">
              No backend, no accounts, no analytics and no cookies. A report you file
              is computed and held in this browser tab only, and is cleared when you
              close or reload it. The datasets shipped with this prototype are
              synthetic.
            </p>
          </div>
          <div>
            <p className="micro-label !text-[0.55rem]">Terms of use</p>
            <p className="mt-1.5 text-[0.72rem] leading-relaxed text-slate-500">
              Provided as-is for research and demonstration, without warranty. Risk
              scores, routing and metrics are illustrative outputs of a prototype and
              must not drive operational decisions. In an emergency, contact the
              appropriate local authority.
            </p>
          </div>
        </div>
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
            Machine-readable summary
          </a>
        </div>
      </div>
    </footer>
  );
}
