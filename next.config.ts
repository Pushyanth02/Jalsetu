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
  // Security headers (preview-compatible: the app must remain embeddable in
  // the sandbox Preview Panel iframe). CSP `frame-ancestors` is the modern
  // clickjacking guard and takes precedence over X-Frame-Options in
  // CSP-capable browsers; X-Frame-Options: SAMEORIGIN stays as a legacy
  // fallback that still permits same-origin embedding (gateway preview).
  async headers() {
    if (isStaticExport) return [];
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https: http://localhost:* http://127.0.0.1:*",
          },
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
