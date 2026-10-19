import type { Metadata, Viewport } from "next";
import { Public_Sans, IBM_Plex_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/app/providers";

import { SITE_URL, SITE_BASE_PATH } from "@/lib/site-config";

/* Typography is chosen, not defaulted (full rationale in globals.css):
   • Public Sans — UI + body. Designed for government digital services;
     best-in-class legibility at 12–14px. A civic face for a civic tool.
   • Fraunces — display serif. Soft, wonky old-style curves that read like
     a printed survey atlas; italic reserved for one poetic accent.
   • IBM Plex Mono — data readouts: codes, coordinates, tabular numerals. */
const publicSans = Public_Sans({
  variable: "--font-public",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: true,
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "monospace"],
  adjustFontFallback: true,
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
  preload: true,
  fallback: ["Georgia", "serif"],
  adjustFontFallback: true,
});

const TITLE = "JalSetu · Delhi Waterlogging Intelligence";
const DESCRIPTION =
  "Interactive research prototype for Delhi monsoon flooding: report waterlogging, watch deterministic rules fuse citizen reports, rainfall, drains and infrastructure into risk-scored events, and track field verification to closure. Bounded Delhi pilot with clearly labelled synthetic demo data.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · JalSetu",
  },
  description: DESCRIPTION,
  applicationName: "JalSetu",
  authors: [{ name: "JalSetu Research Prototype Team" }],
  creator: "JalSetu Research Prototype Team",
  keywords: [
    "Delhi waterlogging",
    "monsoon flooding map",
    "urban flood intelligence",
    "citizen reports",
    "cross-agency coordination",
    "flood risk prediction",
    "GIS dashboard",
    "Delhi monsoon",
  ],
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "JalSetu",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
    images: [
      {
        url: `${SITE_BASE_PATH}/og.jpg`,
        width: 1200,
        height: 630,
        alt: "JalSetu control-room map of Delhi with waterlogging risk markers",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_BASE_PATH}/og.jpg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#05080f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Tile origin — preconnect cuts map TTFB. (next/font self-hosts
            all three faces; there are no third-party font requests.) */}
        <link rel="preconnect" href="https://services.arcgisonline.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://services.arcgisonline.com" />
      </head>
      <body
        className={`${publicSans.variable} ${plexMono.variable} ${fraunces.variable} antialiased bg-background text-foreground min-h-dvh`}
      >
        {/* Skip link — keyboard users jump straight to the view */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-100 focus:rounded-lg focus:bg-aqua focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-950 focus:shadow-lg focus:ring-2 focus:ring-aqua"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
