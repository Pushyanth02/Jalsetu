"use client";

import { Scale, ExternalLink } from "lucide-react";

// TERMS OF SERVICE — the rules for using JalSetu, a fully static research
// prototype. Everything stated here is drawn from how the app is actually
// built: no backend, no accounts, a committed synthetic dataset, and an
// in-browser data layer. Plain-language document, readable end to end.

// Content model: each topic is a panel with a numbered micro-label kicker,
// a font-display heading and reading text at the slate-700 body floor.

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
      <p className="micro-label !text-[0.6rem] text-slate-600">
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

export function TermsView() {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* header strip */}
      <div className="hairline-b bg-ink-900 px-4 sm:px-6 py-3.5">
        <div className="content-wrap">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-2">
              <Scale className="size-3.5 text-water" aria-hidden />
              <span className="micro-label !text-[0.62rem] text-slate-600">Legal · JalSetu Research Prototype</span>
            </span>
            <span className="data-mono ml-auto hidden sm:inline text-[0.62rem] text-slate-500">
              doc v1 · ships with the repository release
            </span>
          </div>
          <h1 className="mt-2 font-display text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Terms of Service
          </h1>
          <p className="mt-1.5 max-w-3xl text-[0.78rem] leading-relaxed text-slate-600">
            These terms apply to JalSetu, a research prototype dashboard for waterlogging in Delhi. It runs as a
            static web page — there is no company behind it, no service level, and no real-world data. The short
            sections below explain what that means before you rely on anything you see here.
          </p>
        </div>
      </div>

      {/* reading column */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-10 sm:px-6">
        <div className="content-wrap">
          <div className="mx-auto max-w-3xl space-y-4">
            <LegalSection id="terms-scope" number="01" kicker="Scope" title="What JalSetu is — and is not">
              <p>
                JalSetu is a <strong className="font-semibold text-slate-800">research prototype</strong> for
                cross-agency waterlogging intelligence. It demonstrates how citizen reports, rainfall, drainage
                and infrastructure data could be fused into risk-scored, explainable urban events. It covers a
                bounded Delhi pilot of three jurisdictions — Ward 68 (Model Town), the Minto Road corridor, and
                the ITO–Barapullah drainage catchment.
              </p>
              <p>
                It is <strong className="font-semibold text-slate-800">not a deployed government system</strong>,
                not an official warning service, and not affiliated with any agency whose names appear in its
                demo data (MCD, PWD, NDMC, DJB, I&FC, DDMA and others appear as synthetic records only).
              </p>
            </LegalSection>

            <LegalSection id="terms-warranty" number="02" kicker="No warranty" title="Provided as is, without warranty">
              <p>
                The prototype is provided as-is and for free. To the extent permitted by law, it carries{" "}
                <strong className="font-semibold text-slate-800">no warranty of any kind</strong> — express or
                implied — including any warranty of accuracy, reliability, availability, or fitness for a
                particular purpose.
              </p>
              <p>
                The dataset is a snapshot that freezes when the page is built. Everything you see — events, risk
                scores, agency routing, verification trails — is computed deterministically in your browser from
                that snapshot, and is labelled as synthetic throughout the interface.
              </p>
            </LegalSection>

            <LegalSection id="terms-permitted" number="03" kicker="Permitted use" title="What you may use it for">
              <p>You are welcome to use JalSetu for research, education, demonstration and evaluation, including:</p>
              <Bullets
                items={[
                  "studying the pipeline (classification, clustering, risk scoring, responsibility routing);",
                  "evaluating the baseline-vs-proposed comparison and its honest metrics;",
                  "building on the code and datasets, within their licences (section 07);",
                  "showing the interface in teaching, talks or write-ups — with the synthetic-data label kept intact.",
                ]}
              />
            </LegalSection>

            <LegalSection id="terms-prohibited" number="04" kicker="Prohibited use" title="What it must not be used for">
              <p>
                The single most important rule:{" "}
                <strong className="font-semibold text-slate-800">
                  do not use JalSetu for operational or emergency decisions.
                </strong>{" "}
                It is a demo with synthetic data. In an emergency, contact your local authorities — in India,
                dial 112. Any hotline number shown inside the prototype is a demo value; do not call it.
              </p>
              <Bullets
                items={[
                  "quoting its events, depths or risk scores as real measurements of Delhi;",
                  "presenting it as an official or government system, or implying any agency endorsement;",
                  "dispatching crews, closing roads, or any action in the real world based on its outputs;",
                  "entering personal information about yourself or others into its forms (see the Privacy Policy).",
                ]}
              />
            </LegalSection>

            <LegalSection id="terms-data" number="05" kicker="Synthetic data" title="The data and imagery are illustrative">
              <p>
                Every event, report, rainfall observation and hotspot in the prototype is{" "}
                <strong className="font-semibold text-slate-800">synthetic demo data</strong>, seeded
                deterministically and labelled as such everywhere in the interface. Site images are AI-generated
                illustrative scenes, marked “illustrative” — they are not photographs of the locations shown.
              </p>
              <p>
                If you cite JalSetu, cite it as a prototype evaluation on synthetic data. It must never be
                quoted as a source of real measurements.
              </p>
            </LegalSection>

            <LegalSection id="terms-session" number="06" kicker="Your session" title="Reports you file exist only in your tab">
              <p>
                Anything you type into the Report view is processed entirely inside your browser tab. Session
                submissions are held in the tab’s in-memory data layer, marked “Live Submission”, and are
                cleared when you close or reload the tab. Nothing is transmitted to a server — none exists.
              </p>
            </LegalSection>

            <LegalSection id="terms-licence" number="07" kicker="Licences" title="Attribution and licences">
              <Bullets
                items={[
                  <>
                    <strong className="font-semibold text-slate-700">Datasets</strong> — the synthetic demo
                    dataset ships as CC-BY-4.0. Attribution required; see the licence link in the page footer.
                  </>,
                  <>
                    <strong className="font-semibold text-slate-700">Code</strong> — the application source is
                    MIT, © JalSetu Contributors, at <RepoLink>github.com/Pushyanth02/JalSetu</RepoLink>.
                  </>,
                  <>
                    <strong className="font-semibold text-slate-700">Map tiles</strong> — served by Esri’s public
                    tile service (“Source: Esri, HERE, Garmin, FAO, NOAA, USGS | © OpenStreetMap contributors”);
                    their terms govern their service.
                  </>,
                ]}
              />
            </LegalSection>

            <LegalSection id="terms-liability" number="08" kicker="Liability" title="Limitation of liability">
              <p>
                To the extent permitted by law, the maintainers are{" "}
                <strong className="font-semibold text-slate-800">not liable</strong> for any loss or damage
                arising from the use of, or reliance on, this prototype or its outputs. It exists to be studied,
                not trusted — that is the point of labelling everything honestly.
              </p>
            </LegalSection>

            <LegalSection id="terms-changes" number="09" kicker="Changes" title="Changes to these terms">
              <p>
                These terms may change with any release of the prototype. The version served on this page
                governs your use of that build. There is no uptime commitment — the page is a static artifact
                and may be unavailable at any time.
              </p>
            </LegalSection>

            <LegalSection id="terms-contact" number="10" kicker="Contact" title="Contact and governing note">
              <p>
                JalSetu is a research prototype based in Delhi, India. The contact channel is the repository:{" "}
                <RepoLink>github.com/Pushyanth02/JalSetu</RepoLink> — please open an issue there for questions
                about these terms.
              </p>
              <p>
                This page is a plain-language notice, not legal advice. Read it alongside the{" "}
                <a href="#/privacy" className="font-medium text-aqua hover:underline">
                  Privacy Policy
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
