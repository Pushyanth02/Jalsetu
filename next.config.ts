import type { NextConfig } from "next";

/**
 * Production hygiene + performance configuration.
 *
 * - productionBrowserSourceMaps: no source maps shipped to browsers
 *   (equivalent of Vite's build.sourcemap: false).
 * - poweredByHeader: no framework fingerprint header.
 * - images: modern formats (AVIF/WebP) via next/image.
 * - experimental.optimizePackageImports: tree-shakes barrel packages so
 *   route-level lazy chunks stay small (App Router splits per route/dynamic
 *   import automatically - the Next.js equivalent of vendor chunk splitting).
 */
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
};

export default nextConfig;
