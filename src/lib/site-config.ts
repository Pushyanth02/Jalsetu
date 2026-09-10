/**
 * Site configuration and canonical URLs.
 * Separated from layout.tsx because Next.js App Router forbids custom
 * named exports from route entry points (layout.tsx / page.tsx).
 */

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const SITE_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
