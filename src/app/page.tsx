import { AppRoot } from "@/components/app/shell/AppRoot";
import { SITE_URL, SITE_BASE_PATH } from "./layout";

/**
 * Root route: the single user-visible page. Server-rendered JSON-LD carries
 * the structured-data suite (WebSite, LocalBusiness, BreadcrumbList, Dataset)
 * so crawlers and AI assistants get a machine-readable site graph while the
 * client app renders the interactive experience.
 */

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}${SITE_BASE_PATH}/#website`,
      url: `${SITE_URL}${SITE_BASE_PATH}/`,
      name: "JalSetu - Delhi Waterlogging Intelligence",
      description:
        "Cross-agency waterlogging intelligence for Delhi: citizen reports, rainfall, GIS and infrastructure fused into explainable urban events.",
      inLanguage: "en-IN",
      isAccessibleForFree: true,
    },
    {
      "@type": "LocalBusiness",
      "@id": `${SITE_URL}${SITE_BASE_PATH}/#project`,
      name: "JalSetu - Delhi Waterlogging Intelligence Lab",
      description:
        "Civic-technology research prototype for monsoon flood intelligence in Delhi. Not a deployed government system.",
      url: `${SITE_URL}${SITE_BASE_PATH}/`,
      additionalType: "https://schema.org/ResearchProject",
      areaServed: {
        "@type": "AdministrativeArea",
        name: "National Capital Territory of Delhi",
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: "New Delhi",
        addressRegion: "DL",
        addressCountry: "IN",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 28.6139,
        longitude: 77.209,
      },
      openingHoursSpecification: {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "09:00",
        closes: "18:00",
      },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${SITE_URL}${SITE_BASE_PATH}/#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SITE_URL}${SITE_BASE_PATH}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Waterlogging Map",
          item: `${SITE_URL}${SITE_BASE_PATH}/#/map`,
        },
      ],
    },
    {
      "@type": "Dataset",
      "@id": `${SITE_URL}${SITE_BASE_PATH}/#hotspot-dataset`,
      name: "Delhi Waterlogging Events And Hotspots (Synthetic Demo Data)",
      description:
        "Deterministic synthetic demonstration dataset for a bounded Delhi pilot (3 jurisdictions): citizen reports, urban events, rainfall observations, infrastructure assets and verification outcomes. All records are labelled as synthetic demo data and must not be quoted as real measurements.",
      url: `${SITE_URL}${SITE_BASE_PATH}/`,
      creator: { "@id": `${SITE_URL}${SITE_BASE_PATH}/#project` },
      spatialCoverage: {
        "@type": "Place",
        geo: {
          "@type": "GeoCoordinates",
          latitude: 28.6139,
          longitude: 77.209,
        },
        name: "Delhi, India",
      },
      variableMeasured: [
        "water depth (cm)",
        "event risk score (0-100)",
        "rainfall (mm, 24h/72h)",
        "report count",
        "verification outcome",
      ],
      isAccessibleForFree: true,
      license: "https://creativecommons.org/licenses/by/4.0/",
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AppRoot />
    </>
  );
}
