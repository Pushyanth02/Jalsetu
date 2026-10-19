import { SITE_URL, SITE_BASE_PATH } from "@/lib/site-config";

/**
 * Serves /llms.txt — the AI-assistant discovery file (llmstxt.org standard).
 *
 * Implemented as a route handler (not a public/ file) so the Site/Sitemap
 * lines always match the real deployment origin: localhost in dev, the
 * Vercel production domain in deployment, or a custom domain when
 * NEXT_PUBLIC_SITE_URL is set. `force-static` lets static export
 * (GitHub Pages) emit it as a plain file.
 */

export const dynamic = "force-static";

const SITE = `${SITE_URL}${SITE_BASE_PATH}/`;

const LINES: string[] = [
  "# JalSetu - Delhi Waterlogging Intelligence",
  "",
  "> A research-grade prototype that turns citizen waterlogging complaints into",
  "> risk-scored, cross-agency urban events for a bounded Delhi pilot. All",
  "> hotspot and event data is deterministic SYNTHETIC DEMO DATA and is labelled",
  "> as such everywhere in the interface. It is not a deployed government system.",
  "",
  `- Site: ${SITE}`,
  "- Hosting: static-friendly (Vercel or GitHub Pages). No server, no database,",
  "  no API keys, no tracking.",
  "- Language: English (India)",
  "- Maintainer: JalSetu Research Prototype Team",
  "- License for datasets: CC-BY-4.0 (synthetic, attribution required)",
  `- Crawl policy: ${SITE}robots.txt | Sitemap: ${SITE}sitemap.xml`,
  "",
  "## What This System Does",
  "",
  "1. Citizens report waterlogging (location, depth, description, optional photo).",
  "2. A deterministic classifier tags each report (category, severity,",
  "   confidence). The deployed app runs a rule-based provider (labelled \"MOCK\")",
  "   - same input, same output, no network. The active provider is always shown",
  "   honestly.",
  "3. Near-duplicate reports are merged into \"urban events\" by time-space clustering.",
  "4. Events are enriched with rainfall, drains, pumps, jurisdiction and history.",
  "5. A transparent rule-based risk model scores each event 0-100 (LOW to CRITICAL).",
  "6. Responsibility routing assigns the accountable agency with an explainable chain.",
  "7. Field teams verify and close events; closures can be reopened on recurrence.",
  "8. Baseline (complaint frequency only) vs proposed (multi-source evidence) is",
  "   evaluated with honest metrics (F1, AUC, ARI) in Research & Analytics.",
  "",
  "## Architecture (static, keyless)",
  "",
  "- The whole app is one page with hash deep-links (no server round trips).",
  "- Data ships inside the page bundle as `src/data/snapshot.json` (a committed,",
  "  clearly labelled synthetic demo dataset) and is queried in the browser",
  "  through a typed in-memory data layer.",
  "- The former REST API surface (envelope: { ok, data | error }) is reimplemented",
  "  in the browser, so every view works identically offline. Mutations run",
  "  client-side and reset on reload - this is documented in the UI.",
  "- Classification is deterministic (rule-based provider); no LLM calls,",
  "  no API keys, nothing to configure.",
  "- The interactive map is MapLibre GL with keyless tiles (Esri World Dark Gray",
  "  Canvas + OpenStreetMap labels).",
  "",
  "## Views (hash deep-links on the single page)",
  "",
  "- /#/ - Landing page: what JalSetu is, the seven-step pipeline, live pilot numbers",
  "- /#/command - Command Center: live ops overview, KPIs, map, alerts, event queue",
  "- /#/map - Waterlogging Map Explorer: interactive map, filters, layers, Locate Me",
  "- /#/events/<code> - Urban Event Dossier: evidence, risk, responsibility, verification",
  "- /#/investigate - Investigation Tools: classify, cluster, score (deterministic, no chain-of-thought shown)",
  "- /#/responsibility - Responsibility Register: agency routing, workload, escalation",
  "- /#/verify - Field Verification Board: assignment to verified closure",
  "- /#/report - Citizen Report: 3-step guided submission with tracking reference",
  "- /#/analytics - Research & Analytics: baseline vs proposed, methodology, traceability",
  "- /#/health - Data & Model Health: source freshness, model runs, endpoint checks, glossary",
  "- /#/terms - Terms of Service: scope of the research prototype, permitted research use, prohibited operational use, synthetic-data disclaimer, licences (CC-BY-4.0 datasets, MIT code), liability",
  "- /#/privacy - Privacy Policy: no accounts, no cookies, no analytics, no server; session-only state held in the tab; third-party Esri map tiles; AI-generated illustrative imagery",
  "",
  "## Data Provenance (integrity rules)",
  "",
  "- CitizenReports, WeatherObservations, InfrastructureAssets, HistoricalIncidents",
  "  and their derived UrbanEvents are SYNTHETIC DEMO DATA (seeded deterministically;",
  "  regenerate offline with `bun run seed`).",
  "- Reports submitted through the Report view during a browsing session are kept",
  "  in memory only and labelled \"Live Submission\" - a reload resets the demo data.",
  "- Model outputs (classification, risk narrative) are MODEL OUTPUT with provider,",
  "  model version and confidence always displayed.",
  "- Performance metrics are computed on the synthetic pilot dataset and labelled",
  "  as evaluation results, never as real-world performance.",
  "",
  "## Key Terms (plain language)",
  "",
  "- Waterlogging: rain water standing on roads long after the rain stops.",
  "- Urban Event: one real-world incident merging several citizen reports.",
  "- Risk Band: LOW, MODERATE, HIGH or CRITICAL urgency estimate for responders.",
  "- Verification: a field crew confirming water depth and resolution on site.",
  "- Ground Truth: independently known hotspot sites used to evaluate the system.",
  "",
  "## Limits",
  "",
  "- Pilot covers 3 Delhi jurisdictions; results do not generalize city-wide.",
  "- No real user accounts; demo roles (CITIZEN, FIELD_TEAM, AGENCY, ADMIN) are",
  "  switched in-app for evaluation.",
  "- The dataset snapshot freezes at build time; it is a demo, not live data.",
];

export function GET() {
  return new Response(`${LINES.join("\n")}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
