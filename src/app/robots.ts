import type { MetadataRoute } from "next";
import { SITE_URL } from "./layout";

/** Dynamic robots.txt: crawl the app shell, keep the JSON API out of indexes. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
