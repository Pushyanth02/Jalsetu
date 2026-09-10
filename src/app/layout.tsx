import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/app/providers";

/**
 * Custom-domain-ready base URL: set NEXT_PUBLIC_SITE_URL in production and
 * every canonical, OG and sitemap URL follows automatically.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
        url: "/og.png",
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
    images: ["/og.png"],
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
  themeColor: "#f6f8fb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${plexMono.variable} antialiased bg-background text-foreground min-h-[100dvh]`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
