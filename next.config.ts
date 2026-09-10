import type { NextConfig } from "next";

/**
 * Production hygiene + GitHub Pages static-export configuration.
 *
 * Two build modes:
 *  - dev / server build (default): `next dev` / `next build`
 *  - static export: STATIC_EXPORT=true next build  -> emits `out/`
 *    (deployed to GitHub Pages by .github/workflows/deploy.yml)
 *
 * GitHub Pages serves project sites under /<repo-name>, so the export sets a
 * matching basePath via NEXT_PUBLIC_BASE_PATH (computed by the workflow; empty
 * for custom domains and user root repos). No API keys are involved anywhere:
 * map tiles are keyless (MapLibre + Esri/OSM) and all data ships in the bundle.
 *
 * - productionBrowserSourceMaps: no source maps shipped to browsers.
 * - poweredByHeader: no framework fingerprint header.
 * - images.unoptimized: deterministic asset URLs in the static export (the
 *   local demo images are small; no server-side optimizer exists on Pages).
 * - trailingSlash in export mode: stable URLs under a subpath.
 * - experimental.optimizePackageImports: tree-shakes barrel packages so
 *   route-level lazy chunks stay small (the Next.js equivalent of vendor
 *   chunk splitting).
 */

const isStaticExport = process.env.STATIC_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/, "") ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
  },
  ...(basePath ? { basePath } : {}),
  ...(isStaticExport ? { output: "export" as const, trailingSlash: true } : {}),
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;
