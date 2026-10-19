/**
 * Site configuration and canonical URLs.
 * Separated from layout.tsx because Next.js App Router forbids custom
 * named exports from route entry points (layout.tsx / page.tsx).
 *
 * SITE_URL resolution order (first match wins):
 *  1. NEXT_PUBLIC_SITE_URL — explicit override (custom domains, GitHub Pages)
 *  2. VERCEL_PROJECT_PRODUCTION_DOMAIN — Vercel production domain
 *     (e.g. `jalsetu.vercel.app` or a custom domain attached to the project)
 *  3. VERCEL_URL — per-deployment URL (preview deployments fall back to this)
 *  4. http://localhost:3000 — local development
 *
 * The Vercel fallbacks mean a Vercel deployment produces correct canonical
 * URLs, sitemap entries and JSON-LD identifiers with zero configuration.
 */

const vercelProductionDomain = process.env.VERCEL_PROJECT_PRODUCTION_DOMAIN
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_DOMAIN.replace(/^\/+|\/+$/g, "")}`
  : undefined;

const vercelDeploymentUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL.replace(/^\/+|\/+$/g, "")}`
  : undefined;

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  vercelProductionDomain ??
  vercelDeploymentUrl ??
  "http://localhost:3000";

export const SITE_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
