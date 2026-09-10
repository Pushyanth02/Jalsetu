import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL } from "./layout";

/**
 * Sitemap index. The application is a single crawlable URL ("/") because all
 * views are hash-routed inside one page; the view map is documented in
 * /llms.txt for AI crawlers. lastModified reflects the freshest urban event
 * so crawlers re-visit when the pilot data changes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let lastModified = new Date();
  try {
    const latest = await db.urbanEvent.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });
    if (latest?.updatedAt) lastModified = latest.updatedAt;
  } catch {
    // database unavailable at build/request time: fall back to "now"
  }

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
