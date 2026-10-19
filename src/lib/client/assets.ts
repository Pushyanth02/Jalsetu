/**
 * Base-path-aware asset URL resolution for JalSetu.
 *
 * Handles three deployment environments seamlessly:
 * 1. Root local development / custom domain (basePath = "")
 * 2. Static export on GitHub Pages (basePath = "/Jalsetu" via NEXT_PUBLIC_BASE_PATH)
 * 3. Client-side runtime fallback: if running on *.github.io/<repo> without env at build time,
 *    it dynamically detects the repository name prefix from window.location.pathname.
 */

export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/**
 * Resolves a public static asset path, guaranteeing the correct base path prefix.
 * Transparently leaves data URIs, blob URIs, and absolute HTTP(S) URLs intact.
 */
export function assetPath(path: string | null | undefined): string {
  if (!path) return "";
  if (
    path.startsWith("data:") ||
    path.startsWith("blob:") ||
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }

  const clean = path.startsWith("/") ? path : `/${path}`;

  // 1. Build-time or environment-defined base path
  if (BASE_PATH) {
    if (clean === BASE_PATH || clean.startsWith(`${BASE_PATH}/`)) {
      return clean;
    }
    return `${BASE_PATH}${clean}`;
  }

  // 2. Client-side fallback for GitHub Pages (e.g. https://<user>.github.io/<repo>/)
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const repoPath = `/${segments[0]}`;
      if (!clean.startsWith(repoPath)) {
        return `${repoPath}${clean}`;
      }
    }
  }

  return clean;
}

/**
 * Resolves an img/source srcSet string by prefixing each URL with the base path.
 * e.g. "/img/hero.webp 480w, /img/hero-2x.webp 960w"
 */
export function assetSrcSet(srcSet: string | null | undefined): string {
  if (!srcSet) return "";
  return srcSet
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim();
      const parts = trimmed.split(/\s+/);
      if (parts.length === 0) return "";
      const url = assetPath(parts[0]);
      return parts.length > 1 ? `${url} ${parts.slice(1).join(" ")}` : url;
    })
    .join(", ");
}
