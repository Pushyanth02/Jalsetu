"use client";

import { useUi, navigate, useClock } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type OverviewResponse, type EventSummary } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Search, MapPin, Bell, ChevronDown, FileSearch, Map as MapIcon } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { NAV_ITEMS, BrandLockup } from "./NavRail";
import { RiskBadge, StatusBadge, TimeAgo } from "@/components/app/shared/domain";
import { PulseDot } from "@/components/motion/kit";

/** White header per reference design: search, time filter, alerts, avatar, location. */
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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-border shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 h-16">
        <button
          className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-900"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <button onClick={() => navigate("command")} className="lg:hidden shrink-0" aria-label="JalSetu home">
          <BrandLockup compact />
        </button>

        <GlobalSearch />

        <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          <TimeFilter />

          <button
            onClick={() => navigate("command")}
            className="relative hidden sm:grid size-9 place-items-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-ink-850 transition-colors"
            aria-label={`Operational alerts${data?.alerts.length ? ` (${data.alerts.length} active)` : ""}`}
          >
            <Bell className="size-4.5" />
            {data && data.alerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 grid min-w-4 h-4 place-items-center rounded-full bg-sev-critical text-white data-mono text-[0.55rem] px-1">
                {data.alerts.length}
              </span>
            )}
          </button>

          <span
            className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 micro-label !text-[0.58rem] text-amber-700"
            title="All pilot data in this prototype is synthetic. Live submissions are labelled separately."
          >
            synthetic demo data
          </span>
          {ai && (
            <span
              className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 micro-label !text-[0.58rem] text-slate-600"
              title={ai.available ? `AI provider: ${ai.modelId} (${ai.configuredBy})` : "AI provider unavailable - deterministic fallback active"}
            >
              <PulseDot size={6} color={ai.available ? "bg-emerald-500" : "bg-amber-500"} />
              {ai.provider === "GLM" ? "GLM online" : ai.provider === "MOCK" ? "deterministic" : ai.provider.toLowerCase()}
            </span>
          )}

          <LocationChip />
          <UserChip now={now} />
        </div>
      </div>

      <div className="lg:hidden hairline-t px-4 py-1.5 flex items-center gap-2">
        <span className="micro-label !text-[0.55rem] text-muted-foreground">{label}</span>
        <time className="ml-auto data-mono text-[0.65rem] text-muted-foreground" suppressHydrationWarning>
          {now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" })} IST
        </time>
      </div>

      {menuOpen && (
        <div className="lg:hidden border-t border-border bg-white max-h-[70dvh] overflow-y-auto">
          <ul className="py-2">
            {NAV_ITEMS.filter((n) => n.id !== "event").map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(item.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-5 py-3 text-sm font-medium text-left rounded-lg mx-2 w-[calc(100%-1rem)]",
                    view === item.id ? "text-water bg-blue-50" : "text-slate-600 hover:text-slate-900 hover:bg-ink-850"
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

/* ---------------------------------------------------------------- search */

/** Global search across events (code/title/location). Keyboard + click. */
function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const openEvent = useUi((s) => s.openEvent);

  const { data: events } = useQuery({
    queryKey: ["events", "search", "200"],
    queryFn: () => apiGet<EventSummary[]>("/api/events?limit=200").then((r) => r.data),
    staleTime: 60_000,
    enabled: q.length >= 2,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const matches = (q.length >= 2 ? (events ?? []) : [])
    .filter((e) => `${e.code} ${e.title} ${e.locationText}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 7);

  return (
    <div ref={wrapRef} className="relative flex-1 max-w-xl min-w-0 hidden sm:block">
      <label className="sr-only" htmlFor="global-search">Search locations, events, reports, or assets</label>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" aria-hidden />
      <input
        ref={inputRef}
        id="global-search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search locations, events, reports, or assets"
        className="w-full h-10 rounded-lg bg-ink-850 border border-transparent focus:border-water/40 focus:bg-white pl-10 pr-14 text-sm text-foreground placeholder:text-slate-400 outline-none transition-colors"
      />
      <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:block data-mono text-[0.6rem] text-slate-400 border border-border rounded px-1.5 py-0.5 bg-white">/</kbd>

      <AnimatePresence>
        {open && q.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            className="absolute z-40 top-12 inset-x-0 panel rounded-xl overflow-hidden"
            role="listbox"
            aria-label="Search results"
          >
            {matches.length === 0 ? (
              <p className="px-4 py-3.5 text-sm text-slate-500">No events match "{q}"</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {matches.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => {
                        setOpen(false);
                        setQ("");
                        openEvent(e.code);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-ink-850 transition-colors group"
                      role="option"
                      aria-selected={false}
                    >
                      <FileSearch className="size-4 text-slate-400 group-hover:text-water shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="data-mono text-[0.7rem] font-semibold text-water">{e.code}</span>
                          <StatusBadge status={e.status} />
                          <RiskBadge band={e.riskBand} score={e.riskScore} />
                        </span>
                        <span className="mt-0.5 block text-[0.78rem] text-slate-700 truncate">{e.title}</span>
                      </span>
                      <TimeAgo iso={e.lastActivityAt} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="hairline-t px-4 py-2 micro-label !text-[0.55rem] text-muted-foreground/70 flex items-center gap-1.5">
              <MapIcon className="size-3" aria-hidden /> enter event dossier · esc to close
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------ time filter */

/** Pilot-window filter mapping to the map/events query (functional, not decorative). */
function TimeFilter() {
  const hours = useUi((s) => s.filters.hours);
  const setFilters = useUi((s) => s.setFilters);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const options: { label: string; value: number | "ALL" }[] = [
    { label: "Last 24 hours", value: 24 },
    { label: "Last 48 hours", value: 48 },
    { label: "Last 7 days", value: 168 },
    { label: "Pilot window (all)", value: "ALL" },
  ];
  const current = options.find((o) => o.value === hours) ?? options[3];

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2 h-9 rounded-lg border border-border bg-white px-3 text-[0.8rem] font-medium text-slate-600 hover:bg-ink-850 transition-colors"
      >
        <span className="data-mono text-[0.72rem]">{current.label}</span>
        <ChevronDown className={cn("size-3.5 text-slate-400 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-40 top-11 w-52 panel rounded-xl p-1.5"
          >
            {options.map((o) => (
              <li key={String(o.value)} role="option" aria-selected={o.value === hours}>
                <button
                  onClick={() => {
                    setFilters({ hours: o.value });
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-[0.8rem] transition-colors",
                    o.value === hours ? "bg-blue-50 text-water font-medium" : "text-slate-600 hover:bg-ink-850"
                  )}
                >
                  {o.label}
                </button>
              </li>
            ))}
            <li className="px-3 py-1.5 micro-label !text-[0.52rem] text-muted-foreground/70">filters map + field board</li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------------------------------------- chips */

function LocationChip() {
  return (
    <span className="hidden lg:inline-flex items-center gap-2 rounded-lg border border-border bg-white pl-2.5 pr-3 h-9">
      <MapPin className="size-4 text-water" aria-hidden />
      <span className="leading-tight">
        <span className="block text-[0.78rem] font-semibold text-slate-800">Delhi</span>
        <span className="block text-[0.56rem] text-slate-400 leading-none mt-0.5">Pilot: 3 jurisdictions</span>
      </span>
    </span>
  );
}

function UserChip({ now }: { now: Date }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="hidden sm:flex flex-col items-end leading-tight">
        <span className="text-[0.78rem] font-semibold text-slate-800">Admin</span>
        <span className="text-[0.56rem] text-slate-400">Monitoring Overview</span>
      </span>
      <span
        className="grid size-9 place-items-center rounded-full bg-water text-white text-[0.72rem] font-bold shrink-0"
        title="Session role: ADMIN"
        aria-label="Admin avatar"
      >
        AD
      </span>
    </span>
  );
}
