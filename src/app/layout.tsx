import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/app/providers";

/**
 * Custom-domain-ready base URL: set NEXT_PUBLIC_SITE_URL in production and
 * every canonical, OG and sitemap URL follows automatically. NEXT_PUBLIC_BASE_PATH
 * carries the GitHub Pages subpath (e.g. /repo-name) when deployed there.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const SITE_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/+$/, "") ?? "";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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

const TITLE = "JalSetu · Delhi Waterlogging Intelligence";
const DESCRIPTION =
  "Interactive research prototype for Delhi monsoon flooding: report waterlogging, watch AI fuse citizen reports, rainfall, drains and infrastructure into risk-scored events, and track field verification to closure. Bounded Delhi pilot with clearly labelled synthetic demo data.";

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
        url: "/og.jpg",
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
    images: ["/og.jpg"],
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
        {/* Tile & font origins — preconnect cuts map TTFB and CLS */}
        <link rel="preconnect" href="https://services.arcgisonline.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://services.arcgisonline.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body
        className={`${inter.variable} ${plexMono.variable} antialiased bg-background text-foreground min-h-[100dvh]`}
      >
        {/* Skip link — keyboard users jump straight to the view */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-aqua focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-950 focus:shadow-lg focus:ring-2 focus:ring-aqua"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
