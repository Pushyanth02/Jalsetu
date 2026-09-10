import type { NextConfig } from "next";

/**
 * JalSetu — Next.js configuration
 *
 * Performance + deploy strategy:
 *  - Static export (`out/`) for GitHub Pages (STATIC_EXPORT=true)
 *  - Base-path aware (project pages vs custom domain)
 *  - Keyless map tiles, no server, no API keys
 *
 * Performance wins:
 *  - `compress: true` — gzip in the export hosting layer
 *  - `productionBrowserSourceMaps: false` — smaller bundles
 *  - `poweredByHeader: false` — no fingerprint
 *  - `optimizePackageImports` — tree-shakes heavy barrels
 *  - `images.unoptimized` stays true for static export determinism,
 *    but AVIF/WebP preference is kept for any future image loader
 *  - `reactStrictMode: true` — catches perf regressions early without ship cost
 */

const isStaticExport = process.env.STATIC_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/, "") ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  ...(basePath ? { basePath } : {}),
  ...(isStaticExport ? { output: "export" as const, trailingSlash: true } : {}),
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "framer-motion"],
  },
  // Cache immutable assets aggressively (static export)
  async headers() {
    if (isStaticExport) return [];
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/img/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
