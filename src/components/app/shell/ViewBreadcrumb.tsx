"use client";

import { useUi, navigate } from "@/lib/client/store";
import { NAV_ITEMS } from "./NavRail";
import { ChevronRight, Home } from "lucide-react";

export function ViewBreadcrumb() {
  const view = useUi((s) => s.view);
  const eventId = useUi((s) => s.eventId);
  const label = NAV_ITEMS.find((n) => n.id === view)?.label ?? "Command Center";
  const isHome = view === "command" && !eventId;

  // Home in the breadcrumb is the public landing page, not the console.
  const goHome = () => navigate("landing");

  return (
    <nav aria-label="Breadcrumb" className="hairline-b bg-ink-900 px-3 sm:px-4 lg:px-6 py-2 sm:py-1.5 overflow-hidden">
      <ol className="flex items-center gap-1 text-[0.68rem] leading-none text-slate-500 min-w-0">
        <li className="shrink-0">
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              goHome();
            }}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1.5 hover:text-aqua hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors touch-target"
            aria-label="Home — JalSetu landing page"
          >
            <Home className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline font-medium">Home</span>
          </a>
        </li>
        {!isHome && (
          <>
            <li aria-hidden className="shrink-0 text-slate-600">
              <ChevronRight className="size-3" />
            </li>
            <li className="min-w-0 shrink">
              {view === "event" ? (
                <a
                  href="#/events"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("event");
                  }}
                  className="rounded-lg px-1.5 py-1.5 hover:text-aqua hover:bg-white/[0.06] transition-colors truncate inline-block max-w-[28vw] sm:max-w-none"
                >
                  {label}
                </a>
              ) : (
                <span aria-current="page" className="font-medium text-slate-200 truncate inline-block max-w-[40vw] sm:max-w-none px-1 py-1">
                  {label}
                </span>
              )}
            </li>
          </>
        )}
        {view === "event" && eventId && (
          <>
            <li aria-hidden className="shrink-0 text-slate-600">
              <ChevronRight className="size-3" />
            </li>
            <li className="min-w-0">
              <span aria-current="page" className="data-mono text-aqua truncate inline-block max-w-[32vw] sm:max-w-none text-[0.7rem] font-semibold px-1 py-1 break-safe">
                {eventId}
              </span>
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
