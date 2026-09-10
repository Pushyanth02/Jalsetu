import type { MetadataRoute } from "next";
import snapshot from "@/data/snapshot.json";
import { SITE_URL } from "./layout";

export const dynamic = "force-static";

// Sitemap for the static deployment. The site is a single hash-routed page, so
// the sitemap carries the root URL (absolute, base-path aware) with an honest
// lastModified timestamp taken from the newest activity in the committed demo
// snapshot (no server, no db).

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/, "") ?? "";

interface SnapshotEvent {
  lastActivityAt?: string;
}

const events = ((snapshot as { tables?: { urbanEvent?: SnapshotEvent[] } }).tables ?? {})
  .urbanEvent ?? [];

const lastModified = events.reduce<Date | null>((latest, event) => {
  const time = event.lastActivityAt ? new Date(event.lastActivityAt) : null;
  if (!time || Number.isNaN(time.getTime())) return latest;
  return !latest || time > latest ? time : latest;
}, null);

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}${BASE_PATH}/`,
      lastModified: lastModified ?? new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
