import Link from "next/link";
import { MapPinOff, MapIcon, Flag, BarChart3, Activity, Home } from "lucide-react";

/**
 * Custom 404: plain-language explanation and clear recovery pathways back to
 * the core experiences. Rendered inside the root layout (fonts + providers).
 */
export default function NotFound() {
  const pathways = [
    {
      href: "/#/map",
      label: "Waterlogging Map",
      hint: "Explore live events on the interactive Delhi map",
      icon: MapIcon,
    },
    {
      href: "/#/report",
      label: "Report Waterlogging",
      hint: "Tell us about standing water near you",
      icon: Flag,
    },
    {
      href: "/#/analytics",
      label: "Research & Analytics",
      hint: "Baseline versus proposed system results",
      icon: BarChart3,
    },
    {
      href: "/#/health",
      label: "Data & Model Health",
      hint: "Sources, model runs and a plain-language glossary",
      icon: Activity,
    },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="hairline-b bg-white">
        <div className="px-4 sm:px-6 h-16 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[10px] bg-gradient-to-b from-[#60a5fa] to-[#2563eb] shrink-0" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
              <path d="M12 3c2.6 3.6 4.7 6 4.7 8.4a4.7 4.7 0 1 1-9.4 0C7.3 9 9.4 6.6 12 3z" fill="#fff" />
            </svg>
          </span>
          <span className="font-display font-bold text-slate-900 text-sm">JalSetu</span>
          <span className="text-[0.62rem] text-slate-400 hidden sm:inline">Delhi Waterlogging Intelligence</span>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 min-h-11 rounded-lg border border-border px-3.5 text-xs font-semibold text-slate-600 hover:bg-ink-850 transition-colors"
          >
            <Home className="size-3.5" aria-hidden />
            Back To Home
          </Link>
        </div>
      </header>

      <main className="flex-1 grid place-items-center px-4 py-10">
        <div className="w-full max-w-xl">
          <div className="panel rounded-xl p-6 sm:p-8 text-center">
            <div className="mx-auto size-12 grid place-items-center rounded-xl bg-blue-50 text-water">
              <MapPinOff className="size-6" aria-hidden />
            </div>
            <h1 className="mt-4 font-display text-xl font-bold tracking-tight text-slate-900">
              Page Not Found
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
              The page you asked for does not exist on this site. It may have been moved,
              or the link may be incomplete. Everything important lives one click away.
            </p>
            <p className="mt-1.5 data-mono text-[0.65rem] text-slate-400">error 404</p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
              {pathways.map(({ href, label, hint, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group rounded-xl border border-border bg-white p-3.5 hover:border-water/50 hover:bg-blue-50/40 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-water" aria-hidden />
                    <span className="text-xs font-semibold text-slate-800 group-hover:text-water">{label}</span>
                  </span>
                  <span className="mt-1 block text-[0.68rem] text-slate-500 leading-snug">{hint}</span>
                </Link>
              ))}
            </div>
          </div>

          <p className="mt-4 text-center text-[0.68rem] text-slate-500">
            Looking for a specific event? Open the{" "}
            <Link href="/#/map" className="text-water hover:text-water-dim font-medium">
              map
            </Link>{" "}
            and search by event code, area or landmark.
          </p>
        </div>
      </main>

      <footer className="mt-auto hairline-t bg-white px-4 sm:px-6 py-3">
        <p className="text-[0.62rem] text-muted-foreground">
          JalSetu · Research prototype · synthetic demo data · not a deployed government system
        </p>
      </footer>
    </div>
  );
}
