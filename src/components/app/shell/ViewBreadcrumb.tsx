"use client";

import { useUi, navigate } from "@/lib/client/store";
import { NAV_ITEMS } from "./NavRail";
import { ChevronRight, Home } from "lucide-react";

/**
 * Visible, accessible breadcrumb strip. Crumbs are real hash anchors
 * (crawlable <a href="#/...">) so the internal link structure stays legible
 * to crawlers and assistive tech; the current crumb carries aria-current.
 */
export function ViewBreadcrumb() {
  const view = useUi((s) => s.view);
  const eventId = useUi((s) => s.eventId);
  const label = NAV_ITEMS.find((n) => n.id === view)?.label ?? "Command Center";
  const isHome = view === "command" && !eventId;

  return (
    <nav aria-label="Breadcrumb" className="hairline-b bg-white px-4 sm:px-6 py-1.5">
      <ol className="flex items-center gap-1 text-[0.68rem] leading-none text-slate-500">
        <li>
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              navigate("command");
            }}
            className="inline-flex items-center gap-1 rounded px-1 py-1 hover:text-water transition-colors"
          >
            <Home className="size-3" aria-hidden />
            <span className="hidden sm:inline">Home</span>
            <span className="sr-only sm:hidden">Home</span>
          </a>
        </li>
        {!isHome && (
          <>
            <li aria-hidden>
              <ChevronRight className="size-3 text-slate-300" />
            </li>
            <li className="min-w-0">
              {view === "event" ? (
                <a
                  href="#/events"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("event");
                  }}
                  className="rounded px-1 py-1 hover:text-water transition-colors truncate"
                >
                  {label}
                </a>
              ) : (
                <span aria-current="page" className="font-medium text-slate-700 truncate">
                  {label}
                </span>
              )}
            </li>
          </>
        )}
        {view === "event" && eventId && (
          <>
            <li aria-hidden>
              <ChevronRight className="size-3 text-slate-300" />
            </li>
            <li className="min-w-0">
              <span aria-current="page" className="data-mono text-water truncate">
                {eventId}
              </span>
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
