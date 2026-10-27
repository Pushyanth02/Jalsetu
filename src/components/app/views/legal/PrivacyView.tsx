"use client";

import { ShieldCheck, ExternalLink } from "lucide-react";

// PRIVACY POLICY — written from the actual build, not a template: the app is
// fully static (no server, no database), uses zero cookies and zero storage
// APIs, and makes exactly one kind of third-party request (Esri map tiles).
// Every claim below was verified against the source before publication.

interface SectionProps {
  id: string;
  number: string;
  kicker: string;
  title: string;
  children: React.ReactNode;
}

function LegalSection({ id, number, kicker, title, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="panel rounded-xl px-4 sm:px-5 py-4">
      <p className="micro-label !text-[0.7rem] text-slate-600">
        {number} · {kicker}
      </p>
      <h2 id={`${id}-title`} className="mt-1.5 font-display text-[1rem] font-semibold leading-snug text-slate-900">
        {title}
      </h2>
      <div className="mt-2.5 space-y-2.5 text-[0.78rem] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5 marker:text-slate-600">
      {items.map((item, i) => (
        <li key={i} className="text-[0.76rem] leading-relaxed text-slate-600">
          {item}
        </li>
      ))}
    </ul>
  );
}

const REPO_URL = "https://github.com/Pushyanth02/JalSetu";

function RepoLink({ children }: { children: React.ReactNode }) {
  return (
    <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-baseline gap-1 font-medium text-aqua hover:underline break-safe">
      {children}
      <ExternalLink className="size-3 shrink-0 translate-y-0.5" aria-hidden />
    </a>
  );
}

export function PrivacyView() {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* header strip */}
      <div className="hairline-b bg-ink-900 px-4 sm:px-6 py-3.5">
        <div className="content-wrap">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-water" aria-hidden />
              <span className="micro-label !text-[0.7rem] text-slate-600">Legal · JalSetu Research Prototype</span>
            </span>
            <span className="data-mono ml-auto hidden sm:inline text-[0.7rem] text-slate-500">
              doc v1 · ships with the repository release
            </span>
          </div>
          <h1 className="mt-2 font-display text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Privacy Policy
          </h1>
          <p className="mt-1.5 max-w-3xl text-[0.78rem] leading-relaxed text-slate-600">
            JalSetu is a fully static research prototype: no server, no accounts, no cookies, no analytics. This
            page explains in plain language what that means for your data — including the one kind of
            third-party request your browser does make.
          </p>
        </div>
      </div>

      {/* reading column */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-10 sm:px-6">
        <div className="content-wrap">
          <div className="mx-auto max-w-3xl space-y-4">
            <LegalSection id="privacy-summary" number="01" kicker="The short version" title="We collect nothing">
              <p>
                JalSetu has no backend. There is no server to log your visit, no account to sign into, and no
                analytics of any kind. The page and its data are downloaded once; everything after that is
                computed in your browser.
              </p>
            </LegalSection>

            <LegalSection id="privacy-not-collected" number="02" kicker="Not collected" title="What we do not collect">
              <p>Concretely, none of the following is collected, stored or transmitted by this app:</p>
              <Bullets
                items={[
                  "names, email addresses, phone numbers or any other personal information;",
                  "your location — the map’s “Locate Me” button is opt-in and stays in the tab (section 03);",
                  "cookies of any kind (session, functional or analytics) — the code sets none;",
                  "device identifiers, fingerprints, or advertising/tracking beacons;",
                  "server logs — there is no server; the site is a static artifact.",
                ]}
              />
            </LegalSection>

            <LegalSection id="privacy-in-browser" number="03" kicker="In your tab" title="What stays in your browser">
              <p>Three kinds of state live only in the current tab’s memory, and all of it clears on reload or close:</p>
              <Bullets
                items={[
                  <>
                    <strong className="font-semibold text-slate-700">Reports you file</strong> — processed by an
                    in-browser reimplementation of the app’s API (the “static engine”) and kept in its in-memory
                    data layer, labelled “Live Submission”.
                  </>,
                  <>
                    <strong className="font-semibold text-slate-700">Query caches</strong> — the dashboard’s
                    data-fetching cache and UI state (filters, map layers) are plain in-memory objects.
                  </>,
                  <>
                    <strong className="font-semibold text-slate-700">“Locate Me”</strong> — if you ask the map to
                    find you, your browser’s position is held only in that tab to draw the dot; it is never sent
                    anywhere and disappears on reload.
                  </>,
                ]}
              />
              <p>
                The app never writes to localStorage, sessionStorage or any other persistent storage — verified
                across the codebase. Closing the tab erases everything instantly.
              </p>
            </LegalSection>

            <LegalSection id="privacy-map-tiles" number="04" kicker="Third-party tiles" title="The one external request: map tiles">
              <p>
                The map basemap and its label overlay are fetched from{" "}
                <strong className="font-semibold text-slate-800">Esri’s public tile CDN</strong>{" "}
                (services.arcgisonline.com), like almost any map site. As with any map site, that CDN sees your
                IP address and standard request details (user agent, which tiles were requested). Esri’s terms
                govern that exchange; the on-map credit line reads “Source: Esri, HERE, Garmin, FAO, NOAA, USGS
                | © OpenStreetMap contributors”.
              </p>
              <p>
                These are the only third-party requests the app makes. Fonts and images are served from the
                site itself; nothing else is fetched, and no other third party receives anything.
              </p>
            </LegalSection>

            <LegalSection id="privacy-imagery" number="05" kicker="Illustrative imagery" title="About the images">
              <p>
                Site images in the prototype are AI-generated illustrative scenes, labelled “illustrative” in
                the interface. They are not photographs of real places, contain no real people, and depict no
                real incident.
              </p>
            </LegalSection>

            <LegalSection id="privacy-dataset" number="06" kicker="Shipped data" title="The data that ships with the page">
              <p>
                The dataset embedded in the page is a committed synthetic snapshot — generated deterministically
                offline, containing no personal data about anyone, and licensed CC-BY-4.0. It is the same for
                every visitor and never changes per person.
              </p>
            </LegalSection>

            <LegalSection id="privacy-children" number="07" kicker="Children" title="Children">
              <p>
                JalSetu is a research dashboard and is not directed at children under 13. No data is gathered
                from visitors of any age, so nothing about a child is ever collected.
              </p>
            </LegalSection>

            <LegalSection id="privacy-rights" number="08" kicker="Your rights" title="Your rights">
              <p>
                Because nothing about you is stored anywhere, there is{" "}
                <strong className="font-semibold text-slate-800">nothing to access, export, correct or delete</strong>{" "}
                — the usual data-rights machinery has no data to act on. If you want your session erased, close
                or reload the tab; that is the entire deletion process.
              </p>
            </LegalSection>

            <LegalSection id="privacy-changes" number="09" kicker="Changes" title="Changes to this policy">
              <p>
                This policy may change with any release of the prototype; the version served on this page
                applies to that build. Since there is no tracking to switch on, any future change would have to
                come from a change in how the app itself is built.
              </p>
            </LegalSection>

            <LegalSection id="privacy-contact" number="10" kicker="Contact" title="Contact">
              <p>
                Questions about this policy? The contact channel is the repository:{" "}
                <RepoLink>github.com/Pushyanth02/JalSetu</RepoLink> — please open an issue there. Read this page
                alongside the{" "}
                <a href="#/terms" className="font-medium text-aqua hover:underline">
                  Terms of Service
                </a>
                .
              </p>
            </LegalSection>
          </div>
        </div>
      </div>
    </div>
  );
}
