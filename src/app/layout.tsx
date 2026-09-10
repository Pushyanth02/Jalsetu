import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/app/providers";

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

export const metadata: Metadata = {
  title: "JalSetu - Delhi Waterlogging Intelligence",
  description:
    "Research prototype: cross-agency waterlogging intelligence for Delhi. Citizen reports, rainfall, GIS, infrastructure and maintenance fused into explainable urban events. Bounded pilot, synthetic demo data.",
  icons: { icon: "/img/jalsetu-mark.svg" },
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
