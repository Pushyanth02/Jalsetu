"use client";

import { useUi, navigate, useClock } from "@/lib/client/store";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type OverviewResponse, type EventSummary } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Search, MapPin, Bell, ChevronDown, FileSearch, Map as MapIcon } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { NAV_ITEMS, BrandLockupLight } from "./NavRail";
import { RiskBadge, StatusBadge, TimeAgo } from "@/components/app/shared/domain";
import { PulseDot } from "@/components/motion/kit";

/** Responsive header — collapses gracefully: search + filters hide on narrow, drawer for nav */
export function TopBar() {
  const view = useUi((s) => s.view);
  const { data } = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview").then((r) => r.data),
    refetchInterval: 60_000,
  });
  const now = useClock();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const label = NAV_ITEMS.find((n) => n.id === view)?.label ?? "Command Center";
  const ai = data?.ai;

  // Close mobile menu + search on view change (adjust-during-render: no
  // cascading effect pass, closes before the new view paints).
  const [lastView, setLastView] = useState(view);
  if (view !== lastView) {
    setLastView(view);
    if (menuOpen) setMenuOpen(false);
    if (searchOpen) setSearchOpen(false);
  }

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 border-b border-border shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-5 h-14 sm:h-16">
        <button
          type="button"
          className="lg:hidden p-2 -ml-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors touch-target shrink-0"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <button
          onClick={() => navigate("command")}
          className="lg:hidden shrink-0 rounded-lg p-1 -ml-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-water"
          aria-label="JalSetu home"
        >
          <BrandLockupLight compact />
        </button>

        {/* Desktop search */}
        <div className="hidden sm:block flex-1 max-w-xl min-w-0">
          <GlobalSearch />
        </div>

        {/* Mobile search toggle */}
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className="sm:hidden ml-auto p-2 rounded-lg text-slate-500 hover:bg-slate-100 touch-target shrink-0"
          aria-label={searchOpen ? "Close search" : "Open search"}
          aria-expanded={searchOpen}
        >
          <Search className="size-5" />
        </button>

        <div className="hidden sm:flex ml-auto items-center gap-2 lg:gap-3 shrink-0">
          <TimeFilter />

          <button
            type="button"
            onClick={() => navigate("command")}
            className="relative hidden sm:grid size-9 place-items-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors touch-target"
            aria-label={`Operational alerts${data?.alerts.length ? ` (${data.alerts.length} active)` : ""}`}
          >
            <Bell className="size-[18px]" />
            {data && data.alerts.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid min-w-4 h-4 place-items-center rounded-full bg-sev-critical text-white data-mono text-[0.55rem] px-1 leading-none font-bold">
                {data.alerts.length > 9 ? "9+" : data.alerts.length}
              </span>
            )}
          </button>

          <span
            className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 micro-label !text-[0.58rem] text-amber-700 whitespace-nowrap"
            title="All pilot data in this prototype is synthetic. Live submissions are labelled separately."
          >
            synthetic demo data
          </span>
          {ai && (
            <span
              className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 micro-label !text-[0.58rem] text-slate-600 whitespace-nowrap"
              title={ai.available ? `AI provider: ${ai.modelId} (${ai.configuredBy})` : "AI provider unavailable — deterministic fallback active"}
            >
              <PulseDot size={6} color={ai.available ? "bg-emerald-500" : "bg-amber-500"} />
              <span className="hidden 2xl:inline">{ai.provider === "GLM" ? "GLM online" : ai.provider === "MOCK" ? "deterministic" : ai.provider.toLowerCase()}</span>
              <span className="2xl:hidden">{ai.provider === "MOCK" ? "mock" : ai.provider.toLowerCase()}</span>
            </span>
          )}

          <LocationChip />
          <UserChip />
        </div>

        {/* Always-visible user chip on mobile (compact) */}
        <div className="sm:hidden flex items-center gap-2 shrink-0">
          <span
            className="grid size-8 place-items-center rounded-full bg-water text-white text-[0.68rem] font-bold shrink-0"
            title="Session role: ADMIN"
            aria-label="Admin"
          >
            AD
          </span>
        </div>
      </div>

      {/* Mobile search bar (expandable) */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sm:hidden overflow-hidden border-t border-border bg-white"
          >
            <div className="p-3">
              <GlobalSearch autoFocus onSelect={() => setSearchOpen(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile view label + time */}
      <div className="lg:hidden hairline-t px-3 sm:px-4 py-1.5 flex items-center gap-2 min-w-0">
        <span className="micro-label !text-[0.55rem] text-muted-foreground truncate">{label}</span>
        <time className="ml-auto data-mono text-[0.65rem] text-muted-foreground whitespace-nowrap shrink-0" suppressHydrationWarning>
          {now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit" })} IST
        </time>
      </div>

      {/* Mobile nav drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="lg:hidden fixed inset-0 top-14 sm:top-16 bg-slate-900/40 backdrop-blur-sm z-20"
              aria-hidden
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              id="mobile-nav-drawer"
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="lg:hidden fixed left-0 top-14 sm:top-16 bottom-0 w-[84%] max-w-[320px] bg-white shadow-2xl z-30 flex flex-col overflow-hidden"
              role="dialog"
              aria-label="Navigation menu"
              aria-modal="true"
            >
              <div className="flex-1 overflow-y-auto py-2 px-2">
                {(
                  [
                    { key: "ops", label: "Operations" },
                    { key: "flow", label: "Evidence Flow" },
                    { key: "research", label: "Research" },
                  ] as const
                ).map((g) => (
                  <div key={g.key} className="mb-4 last:mb-0">
                    <p className="px-3 py-2 micro-label !text-[0.56rem] !text-slate-400">{g.label}</p>
                    <ul className="space-y-0.5" role="list">
                      {NAV_ITEMS.filter((n) => n.group === g.key && n.id !== "event").map((item) => {
                        const active = view === item.id;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuOpen(false);
                                navigate(item.id);
                              }}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "flex w-full items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-left touch-target transition-colors",
                                active ? "text-white bg-sb-900 shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200"
                              )}
                            >
                              <item.icon className={cn("size-4 shrink-0", active ? "text-white" : "text-slate-400")} aria-hidden />
                              <span className="truncate">{item.label}</span>
                              <ChevronDown className="size-3.5 ml-auto -rotate-90 opacity-30 shrink-0" aria-hidden />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="hairline-t p-3 bg-slate-50">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-full bg-water text-white text-xs font-bold shrink-0">AD</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 leading-none">Admin</span>
                    <span className="block text-xs text-slate-500 leading-none mt-1">Monitoring Overview</span>
                  </span>
                  <span className="ml-auto micro-label !text-[0.52rem] text-slate-400 hidden xs:inline">synthetic demo</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ---------------------------------------------------------------- search */

function GlobalSearch({ autoFocus, onSelect }: { autoFocus?: boolean; onSelect?: () => void }) {
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
    <div ref={wrapRef} className="relative flex-1 min-w-0 w-full">
      <label className="sr-only" htmlFor="global-search">Search locations, events, reports, or assets</label>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" aria-hidden />
      <input
        ref={inputRef}
        id="global-search"
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search locations, events, reports…"
        className="w-full h-10 rounded-xl bg-slate-100 border border-transparent focus:border-water/30 focus:bg-white focus:ring-2 focus:ring-water/10 pl-10 pr-12 text-sm text-foreground placeholder:text-slate-400 outline-none transition-all"
      />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden lg:grid place-items-center data-mono text-[0.6rem] text-slate-400 border border-border rounded-md px-1.5 py-0.5 bg-white min-w-5 h-5">/</kbd>

      <AnimatePresence>
        {open && q.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            className="absolute z-40 top-12 inset-x-0 panel rounded-xl overflow-hidden shadow-xl max-h-[70vh] flex flex-col"
            role="listbox"
            aria-label="Search results"
          >
            {matches.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500 text-center">No events match “{q}”</p>
            ) : (
              <ul className="overflow-y-auto flex-1 max-h-80">
                {matches.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setQ("");
                        onSelect?.();
                        openEvent(e.code);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 sm:px-4 py-2.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors group"
                      role="option"
                      aria-selected={false}
                    >
                      <FileSearch className="size-4 text-slate-400 group-hover:text-water shrink-0 hidden xs:block" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="data-mono text-[0.7rem] font-semibold text-water">{e.code}</span>
                          <StatusBadge status={e.status} className="!text-[0.55rem] !px-1.5" />
                          <RiskBadge band={e.riskBand} score={e.riskScore} className="!text-[0.55rem]" />
                        </span>
                        <span className="mt-0.5 block text-[0.78rem] text-slate-700 truncate">{e.title}</span>
                      </span>
                      <TimeAgo iso={e.lastActivityAt} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="hairline-t px-4 py-2 micro-label !text-[0.55rem] text-muted-foreground/70 flex items-center gap-1.5 shrink-0">
              <MapIcon className="size-3 shrink-0" aria-hidden /> tap to open dossier · esc to close
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------ time filter */

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

  const options: { label: string; shortLabel: string; value: number | "ALL" }[] = [
    { label: "Last 24 hours", shortLabel: "24h", value: 24 },
    { label: "Last 48 hours", shortLabel: "48h", value: 48 },
    { label: "Last 7 days", shortLabel: "7d", value: 168 },
    { label: "Pilot window (all)", shortLabel: "All", value: "ALL" },
  ];
  const current = options.find((o) => o.value === hours) ?? options[3];

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Time window: ${current.label}`}
        className="flex items-center gap-2 h-9 rounded-xl border border-border bg-white px-3 text-[0.8rem] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 transition-colors touch-target"
      >
        <span className="data-mono text-[0.72rem] hidden lg:inline">{current.label}</span>
        <span className="data-mono text-xs lg:hidden">{current.shortLabel}</span>
        <ChevronDown className={cn("size-3.5 text-slate-400 transition-transform shrink-0", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Time window"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-40 top-11 w-56 panel rounded-xl p-1.5 shadow-xl"
          >
            {options.map((o) => (
              <li key={String(o.value)} role="option" aria-selected={o.value === hours}>
                <button
                  type="button"
                  onClick={() => {
                    setFilters({ hours: o.value });
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-[0.8rem] transition-colors touch-target",
                    o.value === hours ? "bg-blue-50 text-water font-medium" : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
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
    <span className="hidden xl:inline-flex items-center gap-2 rounded-xl border border-border bg-white pl-2.5 pr-3 h-9 whitespace-nowrap">
      <MapPin className="size-4 text-water shrink-0" aria-hidden />
      <span className="leading-tight text-left">
        <span className="block text-[0.78rem] font-semibold text-slate-800 leading-none">Delhi</span>
        <span className="block text-[0.56rem] text-slate-400 leading-none mt-0.5">3 jurisdictions</span>
      </span>
    </span>
  );
}

function UserChip() {
  return (
    <span className="hidden sm:flex items-center gap-2.5 shrink-0">
      <span className="hidden lg:flex flex-col items-end leading-tight text-right">
        <span className="text-[0.78rem] font-semibold text-slate-800 leading-none">Admin</span>
        <span className="text-[0.56rem] text-slate-400 leading-none mt-1">Monitoring Overview</span>
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
