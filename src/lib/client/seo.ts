"use client";

import { useEffect } from "react";
import type { ViewId } from "./store";

/**
 * Per-view document metadata: since the app is a hash-routed single page,
 * each view updates <title> and <meta name="description"> on activation so
 * tabs, history entries and crawlers see view-specific context. Titles use
 * strict Title Case for primary terms.
 */

export const VIEW_SEO: Record<ViewId, { title: string; description: string }> = {
  landing: {
    title: "Delhi Waterlogging Intelligence",
    description:
      "JalSetu turns citizen waterlogging reports, rainfall, GIS and infrastructure data into explainable, risk-scored urban events for a Delhi pilot. Explore the live demo: command centre, map, event dossiers, AI investigation and field verification.",
  },
  command: {
    title: "Command Center",
    description:
      "Live monsoon operations overview for the Delhi pilot: active waterlogging events, risk movement, agency response and verified resolutions in one screen.",
  },
  map: {
    title: "Waterlogging Map Explorer",
    description:
      "Explore every waterlogging event on an interactive Delhi map. Filter by risk, status and category, find your location, and open plain-language event dossiers.",
  },
  event: {
    title: "Urban Event Dossier",
    description:
      "Full evidence dossier for one urban event: citizen reports, rainfall, infrastructure, AI classification, risk factors, responsibility chain and verification trail.",
  },
  investigate: {
    title: "AI Investigation Tools",
    description:
      "Classify new reports, cluster duplicates and score risk with the AI provider. Confidence, model version and fallback state are always shown honestly.",
  },
  responsibility: {
    title: "Responsibility Register",
    description:
      "Which agency owns which waterlogging event, and why: routing rules, workload, escalation matrix and the full responsibility chain per event.",
  },
  verify: {
    title: "Field Verification Board",
    description:
      "Track field crews from assignment to verified resolution. Every stage is recorded with photos, depth readings and notes before an event can close.",
  },
  report: {
    title: "Report Waterlogging",
    description:
      "Report waterlogging in under a minute. Choose a location, describe what you see, and follow your report as it is classified, merged and verified.",
  },
  analytics: {
    title: "Research & Analytics",
    description:
      "Baseline (complaint frequency) versus proposed (multi-source evidence) comparison with full methodology, dataset notes and honest evaluation labels.",
  },
  health: {
    title: "Data & Model Health",
    description:
      "Source freshness, AI provider state, model run log and API checks for the Delhi waterlogging intelligence prototype, with a plain-language glossary.",
  },
};

const SITE_NAME = "JalSetu";

/** Applies view-specific <title> + meta description while the view is active. */
export function useViewSeo(view: ViewId, eventId: string | null) {
  useEffect(() => {
    const seo = VIEW_SEO[view];
    if (!seo) return;
    const suffix = view === "event" && eventId ? ` ${eventId}` : "";
    document.title = `${seo.title}${suffix} · ${SITE_NAME}`;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    const text = view === "event" && eventId
      ? `Dossier ${eventId}: reports, evidence, risk factors, responsibility and verification for this waterlogging event.`
      : seo.description;
    meta.content = text;
  }, [view, eventId]);
}
