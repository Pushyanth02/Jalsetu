"use client";

import { useRef, useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiClientError, type JurisdictionResponse } from "@/lib/client/api";
import { ErrorNote, Panel, ProviderChip, RISK_META, RiskBadge, SourceBadge, fmtDateTime } from "@/components/app/shared/domain";
import { MapView } from "@/components/app/map/MapView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { navigate, useUi } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AnimatedProgress, CountUp, HoverLift, PulseDot, Reveal, Shine, Stagger, StaggerItem } from "@/components/motion/kit";
import {
  AlertTriangle, Camera, Check, ChevronLeft, ChevronRight, Copy, FileCheck, Flag, LocateFixed, MapPin, Search, X,
} from "lucide-react";

// CITIZEN REPORT - public submission wizard (Location → Issue → Evidence →
// Review → Result) plus tracking lookup by public reference. The full ingest
// pipeline runs server-side: classification, duplicate detection, risk, routing.

const STEPS = ["Location", "Issue", "Evidence", "Review", "Result"] as const;

const CATEGORY_META: { value: string; helper: string }[] = [
  { value: "WATERLOGGING", helper: "Standing water on the road surface" },
  { value: "DRAIN_OVERFLOW", helper: "Water overflowing from a drain or culvert" },
  { value: "SEWER_BACKUP", helper: "Sewage backing up onto the street or property" },
  { value: "POTHOLE", helper: "Damaged road surface, hazard to traffic" },
  { value: "DEBRIS_BLOCKAGE", helper: "Debris or waste blocking a drain or road" },
];

const SEVERITY_META: { value: string; helper: string }[] = [
  { value: "LOW", helper: "Surface water, under 15 cm. Traffic flows normally." },
  { value: "MEDIUM", helper: "15 to 30 cm. Cars slow down, splashing." },
  { value: "HIGH", helper: "30 to 60 cm. Two-wheelers at risk, water enters plots." },
  { value: "CRITICAL", helper: "Over 60 cm. Road impassable, safety risk." },
];

const PHONE_RE = /^(\+91[- ]?)?[6-9]\d{9}$/;

const PIPELINE_META: Record<string, { label: string; cls: string; explain: (o: ReportOutcome) => string }> = {
  EVENT_CREATED: {
    label: "new event created",
    cls: "text-water border-blue-200 bg-blue-50",
    explain: () => "Your report started a new urban event. It has been classified, risk-assessed and routed to the responsible agencies.",
  },
  ATTACHED_DUPLICATE: {
    label: "merged into existing event",
    cls: "text-amber-700 border-amber-200 bg-amber-50",
    explain: (o) =>
      o.duplicateOf
        ? `Your report matched an open event ${o.duplicateOf.code} about ${o.duplicateOf.distanceM}m away (${o.duplicateOf.reason.toLowerCase()}). It was attached as corroborating evidence and raised that event's report count.`
        : "Your report matched an existing open event and was attached to it.",
  },
  REOPENED_RECURRENSE: {
    label: "reopened closed event",
    cls: "text-orange-700 border-orange-200 bg-orange-50",
    explain: (o) =>
      o.duplicateOf
        ? `A closed event ${o.duplicateOf.code} at this location was reopened as a recurrence. Its recurrence count and risk were updated.`
        : "A closed event at this location was reopened as a recurrence.",
  },
};

const REPORT_STATUS_META: Record<string, { label: string; cls: string }> = {
  RECEIVED: { label: "received", cls: "text-slate-600 border-slate-200 bg-slate-50" },
  TRIAGED: { label: "triaged", cls: "text-amber-700 border-amber-200 bg-amber-50" },
  MERGED: { label: "merged into event", cls: "text-water border-blue-200 bg-blue-50" },
  RESOLVED: { label: "resolved", cls: "text-emerald-700 border-emerald-200 bg-emerald-50" },
};

interface ReportOutcome {
  reportId: string;
  publicRef: string;
  event: { id: string; code: string; status: string };
  pipelineAction: string;
  duplicateOf: { code: string; distanceM: number; reason: string; recurrence: boolean } | null;
  classification: {
    provider: string;
    modelId: string;
    fallbackUsed: boolean;
    category: string;
    severity: string;
    confidence: number;
    summary: string;
  };
  risk: { score: number; band: string };
  routing: { agency: string; role: string }[];
}

interface TrackedReport {
  publicRef: string;
  description: string;
  category: string;
  severityReported: string;
  status: string;
  isDuplicate: boolean;
  channel: string;
  source: string;
  submittedAt: string;
  lat: number;
  lng: number;
  addressText: string | null;
  urbanEvent: { id: string; code: string; title: string; status: string; riskBand: string; riskScore: number } | null;
  classificationProvider: string | null;
  classificationConfidence: number | null;
  classification: { category: string; severity: string; confidence: number; isDuplicateSuspected: boolean; factors: string[]; summary: string } | null;
}

type Photo = { dataUrl: string; name: string };

// Downscale an image file to at most maxDim px and return a jpeg data URL.
async function fileToDataUrl(file: File, maxDim: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

function dataUrlKb(dataUrl: string): number {
  return Math.max(1, Math.round((dataUrl.length * 0.75) / 1024));
}

export function ReportView() {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="hairline-b bg-white px-4 sm:px-6 py-3.5">
        <h1 className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-900 leading-tight">
          <span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-water shrink-0" aria-hidden>
            <FileCheck className="size-4.5" />
          </span>
          Citizen Report
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:pl-[2.875rem]">
          Report waterlogging and related issues. Every submission is classified, checked for duplicates, risk-assessed and routed automatically.
        </p>
      </div>

      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 p-3 sm:p-4">
        <Reveal>
          <TrackReport />
        </Reveal>
        <Reveal delay={0.08}>
          <ReportWizard />
        </Reveal>
      </div>
    </div>
  );
}

// --- tracking lookup ------------------------------------------------------------

function TrackReport() {
  const [ref, setRef] = useState("");
  const trackQ = useMutation({
    mutationFn: (q: string) => apiGet<TrackedReport>(`/api/reports/${encodeURIComponent(q)}`).then((r) => r.data),
  });

  const found = trackQ.data;
  const rStatus = found ? REPORT_STATUS_META[found.status] ?? { label: found.status.toLowerCase(), cls: "text-slate-600 border-slate-200 bg-slate-50" } : null;

  return (
    <Panel
      title="Track a Report"
      icon={<Search />}
      actions={<span className="micro-label !text-[0.5rem] text-muted-foreground/70">public reference</span>}
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = ref.trim().toUpperCase();
          if (q) trackQ.mutate(q);
        }}
      >
        <label htmlFor="track-ref" className="sr-only">
          Tracking reference
        </label>
        <Input
          id="track-ref"
          value={ref}
          onChange={(e) => setRef(e.target.value.toUpperCase())}
          placeholder="e.g. CR-4F2K9"
          className="h-9 rounded-lg bg-ink-900 border-border data-mono flex-1"
          maxLength={16}
          autoComplete="off"
        />
        <Button type="submit" size="sm" variant="outline" className="rounded-lg border-border text-slate-600 hover:bg-ink-850 h-9" disabled={trackQ.isPending || !ref.trim()}>
          {trackQ.isPending ? "Looking up…" : "Track"}
        </Button>
      </form>

      {trackQ.isError && (
        <ErrorNote className="mt-3" message={`${(trackQ.error as ApiClientError).message}. Check the reference printed when the report was filed.`} onRetry={() => trackQ.reset()} />
      )}

      {found && (
        <div className="mt-3 rounded-xl border border-border/70 bg-slate-50/70 p-3" aria-live="polite">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="data-mono text-sm font-semibold text-water">{found.publicRef}</span>
            {rStatus && (
              <span className={cn("inline-flex rounded-full border px-2 py-0.5 micro-label !text-[0.58rem]", rStatus.cls)}>{rStatus.label}</span>
            )}
            <SourceBadge source={found.source} />
            <span className="ml-auto micro-label !text-[0.52rem] text-muted-foreground" title={fmtDateTime(found.submittedAt)}>
              {fmtDateTime(found.submittedAt)} · {found.channel.toLowerCase()}
            </span>
          </div>

          <p className="mt-1.5 text-[0.82rem] text-slate-700 leading-relaxed line-clamp-2">{found.description}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.68rem] text-slate-500">
            <span className="data-mono">{found.lat.toFixed(4)}, {found.lng.toFixed(4)}</span>
            <span>reported severity <span className="text-slate-700">{found.severityReported.toLowerCase()}</span></span>
            {found.classification && (
              <span>
                assessed <span className="text-slate-700">{found.classification.category.toLowerCase().replace(/_/g, " ")}</span> ·{" "}
                <span className="text-slate-700">{found.classification.severity.toLowerCase()}</span> · conf{" "}
                <span className="data-mono">{Math.round(found.classification.confidence * 100)}%</span>
              </span>
            )}
            {found.classificationProvider && <ProviderChip provider={found.classificationProvider} />}
          </div>

          {found.urbanEvent ? (
            <div className="mt-3 pt-3 hairline-t flex items-center gap-3 flex-wrap">
              <span className="micro-label !text-[0.52rem] text-muted-foreground">linked event</span>
              <span className="data-mono text-[0.72rem] font-semibold text-water">{found.urbanEvent.code}</span>
              <RiskBadge band={found.urbanEvent.riskBand} score={found.urbanEvent.riskScore} />
              <span className="micro-label !text-[0.52rem] text-muted-foreground">{found.urbanEvent.title}</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto rounded-lg border-border text-slate-600 hover:bg-ink-850 h-7 text-[0.65rem]"
                onClick={() => navigate("event", found.urbanEvent!.code)}
              >
                Open dossier <ChevronRight className="size-3" aria-hidden />
              </Button>
            </div>
          ) : (
            <p className="mt-3 pt-3 hairline-t text-xs text-muted-foreground">No urban event linked yet. The pipeline is still processing this report.</p>
          )}
        </div>
      )}
    </Panel>
  );
}

// --- wizard ---------------------------------------------------------------------

function ReportWizard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();

  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);

  // step 1: location
  const [latText, setLatText] = useState("");
  const [lngText, setLngText] = useState("");
  const [jurisdictionId, setJurisdictionId] = useState("none");
  const [addressText, setAddressText] = useState("");
  const [gpsState, setGpsState] = useState<"idle" | "locating" | "ok" | "error">("idle");
  const [gpsMsg, setGpsMsg] = useState("");

  // step 2: issue
  const [category, setCategory] = useState("WATERLOGGING");
  const [severity, setSeverity] = useState("MEDIUM");
  const [description, setDescription] = useState("");

  // step 3: evidence
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);

  // step 4: result
  const [outcome, setOutcome] = useState<ReportOutcome | null>(null);

  const jurisdictionsQ = useQuery({
    queryKey: ["jurisdictions"],
    queryFn: () => apiGet<JurisdictionResponse[]>("/api/jurisdictions").then((r) => r.data),
    staleTime: 600_000,
  });
  const jurisdictions = jurisdictionsQ.data ?? [];

  const latNum = Number(latText);
  const lngNum = Number(lngText);
  const latValid = latText.trim() !== "" && Number.isFinite(latNum) && latNum >= 28.3 && latNum <= 28.9;
  const lngValid = lngText.trim() !== "" && Number.isFinite(lngNum) && lngNum >= 76.8 && lngNum <= 77.6;
  const coordsValid = latValid && lngValid;

  const descTrim = description.trim();
  const descValid = descTrim.length >= 12 && descTrim.length <= 600;
  const phoneTrim = phone.trim();
  const phoneValid = phoneTrim === "" || PHONE_RE.test(phoneTrim);

  const stepValid = [coordsValid, descValid, phoneValid && consent, true][step];

  const onJurisdiction = (v: string) => {
    setJurisdictionId(v);
    if (v !== "none") {
      const j = jurisdictions.find((x) => x.id === v);
      if (j) {
        setLatText(j.centroid.lat.toFixed(5));
        setLngText(j.centroid.lng.toFixed(5));
      }
    }
  };

  const onGps = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGpsState("error");
      setGpsMsg("Geolocation is not available in this browser. Enter coordinates manually.");
      return;
    }
    setGpsState("locating");
    setGpsMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatText(pos.coords.latitude.toFixed(5));
        setLngText(pos.coords.longitude.toFixed(5));
        setGpsState("ok");
        setGpsMsg("Device coordinates captured. They must fall inside the pilot window (lat 28.3 to 28.9, lng 76.8 to 77.6) to submit.");
      },
      () => {
        setGpsState("error");
        setGpsMsg("Location permission denied or unavailable. Enter coordinates manually or pick a pilot area.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 }
    );
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const onPhotoFile = async (file: File) => {
    setPhotoBusy(true);
    setPhotoErr(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please select an image file.");
      const dataUrl = await fileToDataUrl(file, 1024, 0.7);
      setPhoto({ dataUrl, name: file.name });
    } catch (e) {
      setPhotoErr((e as Error).message);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = useMutation({
    mutationFn: () =>
      apiPost<ReportOutcome>(
        "/api/reports",
        {
          description: descTrim,
          category,
          severityReported: severity,
          lat: latNum,
          lng: lngNum,
          addressText: addressText.trim() || undefined,
          channel: "WEB",
          reporterPhone: phoneTrim || undefined,
          consentGiven: true,
          photoDataUrl: photo?.dataUrl,
        },
        "CITIZEN"
      ),
    onSuccess: (r) => {
      setOutcome(r.data);
      setStep(4);
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast({ title: "Report submitted", description: `Tracking reference ${r.data.publicRef}. Keep it to follow the outcome.` });
    },
    onError: (e) => {
      toast({ title: "Submission failed", description: (e as ApiClientError).message, variant: "destructive" });
    },
  });

  const goTo = (n: number) => {
    setAttempted(false);
    setStep(n);
  };

  const next = () => {
    if (!stepValid) {
      setAttempted(true);
      return;
    }
    if (step === 3) {
      submit.mutate();
      return;
    }
    goTo(Math.min(3, step + 1));
  };

  const reset = () => {
    setStep(0);
    setAttempted(false);
    setLatText("");
    setLngText("");
    setJurisdictionId("none");
    setAddressText("");
    setGpsState("idle");
    setGpsMsg("");
    setCategory("WATERLOGGING");
    setSeverity("MEDIUM");
    setDescription("");
    setPhoto(null);
    setPhotoErr(null);
    setPhone("");
    setConsent(false);
    setOutcome(null);
    submit.reset();
  };

  const locked = !!outcome; // wizard locks into result state after success

  return (
    <Panel
      title="File a New Report"
      icon={<Flag />}
      actions={<span className="micro-label !text-[0.5rem] text-muted-foreground/70">public · web channel</span>}
    >
      {/* step progress: numbered circles, completed shows a check */}
      <ol className="flex items-center gap-0 overflow-x-auto no-scrollbar pb-1" aria-label="Wizard progress">
        {STEPS.map((label, i) => {
          const done = locked ? i <= 4 : i < step;
          const current = locked ? i === 4 : i === step;
          const reachable = !locked && i <= step;
          return (
            <li key={label} className="flex items-center shrink-0">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && goTo(i)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 px-2 py-1 rounded-lg transition-colors",
                  reachable ? "cursor-pointer hover:bg-ink-850" : "cursor-default",
                  current && "bg-blue-50"
                )}
              >
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-full font-semibold data-mono !text-[0.72rem] !tracking-normal transition-colors",
                    done ? (current ? "bg-water text-white" : "bg-blue-50 text-water") : current ? "bg-water text-white" : "bg-ink-850 text-slate-400"
                  )}
                  aria-hidden
                >
                  {done && i !== 4 ? <Check className="size-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[0.7rem] font-medium",
                    current ? "text-slate-900" : done ? "text-slate-600" : "text-slate-400"
                  )}
                >
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 && <span className={cn("h-px w-4 sm:w-6", done ? "bg-water/40" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>

      <div className="mt-2 pt-4 hairline-t">
        {/* step content transitions: fade + slide, reduced-motion safe */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            {step === 0 && (
              <StepLocation
                latText={latText}
                lngText={lngText}
                onLat={setLatText}
                onLng={setLngText}
                latValid={latValid}
                lngValid={lngValid}
                coordsValid={coordsValid}
                attempted={attempted}
                jurisdictionId={jurisdictionId}
                onJurisdiction={onJurisdiction}
                jurisdictions={jurisdictions}
                jurisdictionsLoading={jurisdictionsQ.isLoading}
                jurisdictionsError={jurisdictionsQ.isError ? (jurisdictionsQ.error as Error).message : null}
                addressText={addressText}
                onAddress={setAddressText}
                gpsState={gpsState}
                gpsMsg={gpsMsg}
                onGps={onGps}
              />
            )}

            {step === 1 && (
              <StepIssue
                category={category}
                onCategory={setCategory}
                severity={severity}
                onSeverity={setSeverity}
                description={description}
                onDescription={setDescription}
                descValid={descValid}
                attempted={attempted}
              />
            )}

            {step === 2 && (
              <StepEvidence
                photo={photo}
                photoBusy={photoBusy}
                photoErr={photoErr}
                fileRef={fileRef}
                onPhotoFile={onPhotoFile}
                onRemovePhoto={() => setPhoto(null)}
                phone={phone}
                onPhone={setPhone}
                phoneValid={phoneValid}
                consent={consent}
                onConsent={setConsent}
                attempted={attempted}
              />
            )}

            {step === 3 && (
              <StepReview
                lat={latNum}
                lng={lngNum}
                jurisdictionName={jurisdictions.find((j) => j.id === jurisdictionId)?.name ?? null}
                addressText={addressText.trim()}
                category={category}
                severity={severity}
                description={descTrim}
                photo={photo}
                phone={phoneTrim}
                submitPending={submit.isPending}
                submitError={submit.isError ? (submit.error as ApiClientError).message : null}
                onSubmit={next}
              />
            )}

            {step === 4 && outcome && <StepResult outcome={outcome} onReset={reset} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* nav */}
      {!locked && (
        <div className="mt-5 pt-3 hairline-t flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-lg border-border text-slate-600 hover:bg-ink-850" disabled={step === 0} onClick={() => goTo(Math.max(0, step - 1))}>
            <ChevronLeft className="size-3.5" aria-hidden /> Back
          </Button>
          <span className="micro-label !text-[0.52rem] text-muted-foreground">
            {step < 3 ? `${step + 1} of 4` : "final check"}
          </span>
          {step < 3 ? (
            <Button type="button" size="sm" className="group relative overflow-hidden rounded-lg bg-water text-white hover:bg-water-dim" onClick={next}>
              {attempted && !stepValid ? "Fix to continue" : "Continue"} <ChevronRight className="size-3.5" aria-hidden />
              <Shine />
            </Button>
          ) : (
            <Button type="button" size="sm" className="group relative overflow-hidden rounded-lg bg-water text-white hover:bg-water-dim" disabled={submit.isPending} onClick={next}>
              {submit.isPending ? "Submitting…" : "Submit report"}
              <Shine />
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}

// --- step 1: location -------------------------------------------------------------

function StepLocation(p: {
  latText: string;
  lngText: string;
  onLat: (v: string) => void;
  onLng: (v: string) => void;
  latValid: boolean;
  lngValid: boolean;
  coordsValid: boolean;
  attempted: boolean;
  jurisdictionId: string;
  onJurisdiction: (v: string) => void;
  jurisdictions: JurisdictionResponse[];
  jurisdictionsLoading: boolean;
  jurisdictionsError: string | null;
  addressText: string;
  onAddress: (v: string) => void;
  gpsState: "idle" | "locating" | "ok" | "error";
  gpsMsg: string;
  onGps: () => void;
}) {
  const latNum = Number(p.latText);
  const lngNum = Number(p.lngText);

  return (
    <div className="space-y-4">
      <div className="relative h-52 sm:h-60 rounded-xl overflow-hidden border border-border/70 shadow-sm">
        <MapView events={[]} interactive className="size-full" />
        <div className="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur-sm border-t border-slate-200/70 p-2.5 pointer-events-none">
          <p className="micro-label !text-[0.52rem] text-slate-500">
            pilot window: central Delhi · place the report with coordinates, GPS or a pilot area below
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rep-lat" className="text-xs">
            Latitude
          </Label>
          <Input
            id="rep-lat"
            inputMode="decimal"
            value={p.latText}
            onChange={(e) => p.onLat(e.target.value.replace(/[^\d.\-]/g, ""))}
            placeholder="28.6285"
            className="h-9 rounded-lg bg-ink-900 border-border data-mono"
            aria-invalid={p.attempted && !p.latValid}
            aria-describedby="rep-lat-hint"
          />
          <p id="rep-lat-hint" className={cn("text-[0.62rem]", p.attempted && !p.latValid ? "text-sev-high" : "text-muted-foreground")}>
            {p.attempted && !p.latValid
              ? p.latText.trim() === ""
                ? "Latitude is required."
                : "Must be a number between 28.3 and 28.9 (Delhi region)."
              : "28.3 to 28.9"}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rep-lng" className="text-xs">
            Longitude
          </Label>
          <Input
            id="rep-lng"
            inputMode="decimal"
            value={p.lngText}
            onChange={(e) => p.onLng(e.target.value.replace(/[^\d.\-]/g, ""))}
            placeholder="77.2216"
            className="h-9 rounded-lg bg-ink-900 border-border data-mono"
            aria-invalid={p.attempted && !p.lngValid}
            aria-describedby="rep-lng-hint"
          />
          <p id="rep-lng-hint" className={cn("text-[0.62rem]", p.attempted && !p.lngValid ? "text-sev-high" : "text-muted-foreground")}>
            {p.attempted && !p.lngValid
              ? p.lngText.trim() === ""
                ? "Longitude is required."
                : "Must be a number between 76.8 and 77.6 (Delhi region)."
              : "76.8 to 77.6"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-start">
        <Button type="button" variant="outline" size="sm" className="rounded-lg border-border text-slate-600 hover:bg-ink-850" onClick={p.onGps} disabled={p.gpsState === "locating"}>
          <LocateFixed className={cn("size-3.5", p.gpsState === "locating" && "animate-pulse")} aria-hidden />
          {p.gpsState === "locating" ? "Locating…" : "Use my location"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg border-border text-slate-600 hover:bg-ink-850"
          disabled={!p.coordsValid}
          onClick={() => useUi.getState().focusMap(latNum, lngNum, 14)}
        >
          <MapPin className="size-3.5" aria-hidden /> Preview on map
        </Button>
        {p.gpsState === "ok" && !p.coordsValid && (
          <span className="text-[0.62rem] text-sev-moderate self-center">Device location is outside the pilot window. Adjust manually.</span>
        )}
      </div>

      {p.gpsMsg && (
        <p className={cn("text-[0.62rem] flex items-start gap-1.5", p.gpsState === "error" ? "text-sev-moderate" : "text-muted-foreground")} role={p.gpsState === "error" ? "alert" : undefined}>
          {p.gpsState === "error" && <AlertTriangle className="size-3.5 shrink-0 mt-px" aria-hidden />}
          {p.gpsMsg}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Pilot area (optional)</Label>
          {p.jurisdictionsError ? (
            <p className="text-[0.62rem] text-sev-moderate">Pilot areas unavailable: {p.jurisdictionsError}</p>
          ) : (
            <Select value={p.jurisdictionId} onValueChange={p.onJurisdiction}>
              <SelectTrigger className="h-9 rounded-lg bg-ink-900 border-border text-xs" aria-label="Pilot area">
                <SelectValue placeholder="Select a pilot area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  None (enter coordinates)
                </SelectItem>
                {p.jurisdictions.map((j) => (
                  <SelectItem key={j.id} value={j.id} className="text-xs">
                    {j.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-[0.62rem] text-muted-foreground">Selecting an area fills the coordinates with its centroid. You can fine-tune them after.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rep-address" className="text-xs">
            Landmark or address (optional)
          </Label>
          <Input
            id="rep-address"
            value={p.addressText}
            onChange={(e) => p.onAddress(e.target.value)}
            placeholder="e.g. near Minto Road pump station"
            className="h-9 rounded-lg bg-ink-900 border-border text-xs"
            maxLength={160}
          />
          <p className="text-[0.62rem] text-muted-foreground">Free text, up to 160 characters. Helps field teams locate the spot.</p>
        </div>
      </div>
    </div>
  );
}

// --- step 2: issue + severity ------------------------------------------------------

function OptionCard({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  return (
    <HoverLift>
      <label
        className={cn(
          "flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors bg-white shadow-xs",
          selected ? "border-water bg-blue-50" : "border-border/80 hover:bg-ink-850/60"
        )}
      >
        {children}
      </label>
    </HoverLift>
  );
}

function StepIssue(p: {
  category: string;
  onCategory: (v: string) => void;
  severity: string;
  onSeverity: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  descValid: boolean;
  attempted: boolean;
}) {
  const descLen = p.description.trim().length;
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="micro-label mb-2.5">what is the issue</legend>
        <RadioGroup value={p.category} onValueChange={p.onCategory} aria-label="Issue category">
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {CATEGORY_META.map((c) => (
              <StaggerItem key={c.value}>
                <OptionCard selected={p.category === c.value}>
                  <RadioGroupItem value={c.value} className="mt-0.5 data-[state=checked]:border-water" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{c.value.toLowerCase().replace(/_/g, " ")}</span>
                    <span className="block mt-0.5 text-[0.68rem] text-slate-500 leading-snug">{c.helper}</span>
                  </span>
                </OptionCard>
              </StaggerItem>
            ))}
          </Stagger>
        </RadioGroup>
      </fieldset>

      <fieldset>
        <legend className="micro-label mb-2.5">how severe (water depth guide)</legend>
        <RadioGroup value={p.severity} onValueChange={p.onSeverity} aria-label="Severity">
          <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {SEVERITY_META.map((s) => (
              <StaggerItem key={s.value}>
                <OptionCard selected={p.severity === s.value}>
                  <RadioGroupItem value={s.value} className="mt-0.5 data-[state=checked]:border-water" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{s.value.toLowerCase()}</span>
                    <span className="block mt-0.5 text-[0.62rem] text-slate-500 leading-snug">{s.helper}</span>
                  </span>
                </OptionCard>
              </StaggerItem>
            ))}
          </Stagger>
        </RadioGroup>
      </fieldset>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="rep-desc" className="text-xs">
            Describe what you see
          </Label>
          <span className={cn("data-mono text-[0.62rem]", p.attempted && !p.descValid ? "text-sev-high" : "text-muted-foreground")}>
            {descLen}/600
          </span>
        </div>
        <Textarea
          id="rep-desc"
          value={p.description}
          onChange={(e) => p.onDescription(e.target.value)}
          rows={4}
          placeholder="e.g. Knee-deep water on the underpass approach, drains not taking flow, traffic diverted"
          className="rounded-lg bg-ink-900 border-border text-sm"
          maxLength={600}
          aria-invalid={p.attempted && !p.descValid}
          aria-describedby="rep-desc-hint"
        />
        <p id="rep-desc-hint" className={cn("text-[0.62rem]", p.attempted && !p.descValid ? "text-sev-high" : "text-muted-foreground")}>
          {p.attempted && !p.descValid
            ? descLen < 12
              ? `At least 12 characters needed (${descLen} so far).`
              : "Description too long (max 600 characters)."
            : "12 to 600 characters. The AI classifier reads this text, so concrete details help."}
        </p>
      </div>
    </div>
  );
}

// --- step 3: photo + contact --------------------------------------------------------

interface StepEvidenceProps {
  photo: Photo | null;
  photoBusy: boolean;
  photoErr: string | null;
  fileRef: RefObject<HTMLInputElement | null>;
  onPhotoFile: (f: File) => void;
  onRemovePhoto: () => void;
  phone: string;
  onPhone: (v: string) => void;
  phoneValid: boolean;
  consent: boolean;
  onConsent: (v: boolean) => void;
  attempted: boolean;
}

function StepEvidence(props: StepEvidenceProps) {
  const { photo, photoBusy, photoErr, fileRef, onPhotoFile, onRemovePhoto, phone, onPhone, phoneValid, consent, onConsent, attempted } = props;
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Photo evidence (optional)</Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          id="rep-photo"
          onChange={(e) => e.target.files?.[0] && onPhotoFile(e.target.files[0])}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-lg border-border text-slate-600 hover:bg-ink-850" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
            <Camera className="size-3.5" aria-hidden /> {photoBusy ? "Processing…" : photo ? "Replace photo" : "Select photo"}
          </Button>
          {photo && (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-[0.65rem] text-slate-500" onClick={onRemovePhoto}>
              <X className="size-3" aria-hidden /> Remove
            </Button>
          )}
          <span className="text-[0.62rem] text-slate-500">Downscaled to at most 1024px jpeg and stored as a data URL in the demo database.</span>
        </div>
        {photoErr && <p className="mt-1.5 text-[0.62rem] text-sev-high" role="alert">{photoErr}</p>}
        {photo && (
          <figure className="mt-2.5 flex items-start gap-3 rounded-xl border border-border/70 bg-white p-2.5 shadow-sm ring-1 ring-slate-200/60 max-w-sm">
            <div className="relative rounded-lg overflow-hidden border border-border/60 size-20 shrink-0 bg-slate-100">
              <img src={photo.dataUrl} alt="Report photo preview" className="size-full object-cover" />
            </div>
            <figcaption className="min-w-0 text-[0.65rem] text-slate-500">
              <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 text-water px-2 py-0.5 micro-label !text-[0.52rem]">uploaded</span>
              <span className="block mt-1 truncate">{photo.name}</span>
              <span className="data-mono block mt-0.5">{dataUrlKb(photo.dataUrl)} KB · jpeg</span>
            </figcaption>
          </figure>
        )}
      </div>

      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="rep-phone" className="text-xs">
          Phone (optional)
        </Label>
        <Input
          id="rep-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => onPhone(e.target.value)}
          placeholder="98XXXXXXXX or +91 98XXXXXXXX"
          className="h-9 rounded-lg bg-ink-900 border-border data-mono"
          maxLength={16}
          aria-invalid={attempted && !phoneValid}
          aria-describedby="rep-phone-hint"
        />
        <p id="rep-phone-hint" className={cn("text-[0.62rem]", attempted && !phoneValid ? "text-sev-high" : "text-muted-foreground")}>
          {attempted && !phoneValid
            ? "Indian mobile number expected (10 digits starting 6 to 9, optional +91), or leave empty."
            : "Indian mobile format, or leave empty. Stored hashed, never displayed."}
        </p>
      </div>

      <div className="rounded-xl border border-border/70 bg-slate-50/70 p-3.5">
        <label className="flex items-start gap-2.5 cursor-pointer" htmlFor="rep-consent">
          <Checkbox id="rep-consent" checked={consent} onCheckedChange={(v) => onConsent(v === true)} className="mt-0.5 data-[state=checked]:bg-water data-[state=checked]:border-water data-[state=checked]:text-white" />
          <span className="text-xs leading-relaxed text-slate-600">
            <span className="text-slate-800 font-medium">I consent to this report being processed.</span>
            <span className="block mt-0.5 text-slate-500">
              Location and photo are used only for this report and its event. Phone is optional and stored hashed. This is a research demo, not a deployed government service.
            </span>
          </span>
        </label>
        {attempted && !consent && (
          <p className="mt-2 text-[0.62rem] text-sev-high" role="alert">
            Consent is required to submit a report.
          </p>
        )}
      </div>
    </div>
  );
}

// --- step 4: review ------------------------------------------------------------------

function StepReview(p: {
  lat: number;
  lng: number;
  jurisdictionName: string | null;
  addressText: string;
  category: string;
  severity: string;
  description: string;
  photo: Photo | null;
  phone: string;
  submitPending: boolean;
  submitError: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="micro-label">final check before submission</p>
      <dl className="rounded-xl border border-border/70 bg-slate-50/60 divide-y divide-border/60 text-xs">
        <ReviewRow label="coordinates" value={`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`} />
        <ReviewRow label="pilot area" value={p.jurisdictionName ?? "none selected"} />
        <ReviewRow label="landmark" value={p.addressText || "none"} />
        <ReviewRow label="category" value={p.category.toLowerCase().replace(/_/g, " ")} />
        <ReviewRow label="severity reported" value={p.severity.toLowerCase()} />
        <ReviewRow label="description" value={p.description} multiline />
        <ReviewRow label="photo" value={p.photo ? `attached (${p.photo.name}, ${dataUrlKb(p.photo.dataUrl)} KB jpeg)` : "none"} />
        <ReviewRow label="phone" value={p.phone ? "provided (stored hashed)" : "not provided"} />
      </dl>
      <p className="text-[0.65rem] text-slate-500">
        On submit the pipeline classifies the report, checks for duplicates within 150m and 48h, computes risk and routes responsibility. The outcome reference lets you track it.
      </p>
      {p.submitError && <ErrorNote message={p.submitError} />}
      <div className="flex justify-end">
        <Button size="sm" className="group relative overflow-hidden rounded-lg bg-water text-white hover:bg-water-dim" disabled={p.submitPending} onClick={p.onSubmit}>
          {p.submitPending ? "Submitting…" : "Submit report"}
          <Shine />
        </Button>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-3.5 py-2.5">
      <dt className="micro-label !text-[0.52rem] w-32 shrink-0 pt-0.5">{label}</dt>
      <dd className={cn("data-mono !text-[0.72rem] text-slate-700 min-w-0", multiline ? "whitespace-pre-wrap leading-relaxed" : "truncate")}>{value}</dd>
    </div>
  );
}

// --- step 5: result --------------------------------------------------------------------

function StepResult({ outcome, onReset }: { outcome: ReportOutcome; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const pipe = PIPELINE_META[outcome.pipelineAction] ?? {
    label: outcome.pipelineAction.toLowerCase().replace(/_/g, " "),
    cls: "text-slate-600 border-slate-200 bg-slate-50",
    explain: () => "Pipeline completed.",
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(outcome.publicRef);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable; ref remains visible */
    }
  };

  return (
    <div className="space-y-4" aria-live="polite">
      <Reveal>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="micro-label !text-[0.55rem] text-water flex items-center gap-2">
            <PulseDot color="bg-emerald-500" size={7} />
            report submitted · tracking reference
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="data-mono text-2xl sm:text-[1.7rem] font-bold text-water tracking-tight">{outcome.publicRef}</span>
            <Button type="button" variant="outline" size="sm" className="rounded-lg border-blue-200 bg-white text-water hover:bg-blue-100/60 h-7 text-[0.65rem]" onClick={copy}>
              {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-1.5 text-[0.65rem] text-slate-500">Save this reference. Use the lookup above to follow the report at any time.</p>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="micro-label !text-[0.52rem] text-muted-foreground">pipeline outcome</span>
          <span className={cn("inline-flex rounded-full border px-2.5 py-1 micro-label !text-[0.6rem]", pipe.cls)}>{pipe.label}</span>
        </div>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed">{pipe.explain(outcome)}</p>
      </Reveal>

      <Reveal delay={0.14}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/70 bg-white p-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="micro-label !text-[0.52rem]">classification</p>
              <ProviderChip provider={outcome.classification.provider} model={outcome.classification.modelId} />
            </div>
            <dl className="mt-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">category</dt>
                <dd className="data-mono text-slate-800">{outcome.classification.category.toLowerCase().replace(/_/g, " ")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">severity</dt>
                <dd className="data-mono text-slate-800">{outcome.classification.severity.toLowerCase()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">confidence</dt>
                <dd className="text-slate-800">
                  <CountUp value={Math.round(outcome.classification.confidence * 100)} suffix="%" />
                </dd>
              </div>
            </dl>
            <p className="mt-2.5 text-[0.65rem] text-slate-500 leading-relaxed border-l-2 border-blue-200 pl-2.5">
              {outcome.classification.summary}
            </p>
            {outcome.classification.fallbackUsed && (
              <p className="mt-1.5 text-[0.62rem] text-sev-moderate">Deterministic fallback was used for this classification (AI provider unavailable).</p>
            )}
          </div>

          <div className="rounded-xl border border-border/70 bg-white p-3.5 shadow-xs">
            <p className="micro-label !text-[0.52rem]">risk &amp; routing</p>
            <div className="mt-2.5 flex items-center gap-2">
              <RiskBadge band={outcome.risk.band} score={outcome.risk.score} />
              <span className="text-[0.65rem] text-slate-500">risk score of 100, 7-factor explainable model</span>
            </div>
            <AnimatedProgress className="mt-3" value={outcome.risk.score} max={100} fillClassName={RISK_META[outcome.risk.band]?.bar ?? "bg-water-dim"} />
            <ul className="mt-3 space-y-1">
              {outcome.routing.length === 0 ? (
                <li className="text-xs text-slate-500">No agency links recorded.</li>
              ) : (
                outcome.routing.map((r) => (
                  <li key={`${r.agency}-${r.role}`} className="flex items-center gap-2 text-xs">
                    <span className="data-mono font-semibold text-water">{r.agency}</span>
                    <span className="micro-label !text-[0.5rem] text-slate-500">{r.role.toLowerCase()}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.2}>
        <div className="rounded-xl border border-border/70 bg-white p-3.5 shadow-xs flex items-center gap-3 flex-wrap">
          <span className="micro-label !text-[0.52rem] text-muted-foreground">urban event</span>
          <span className="data-mono text-sm font-semibold text-water">{outcome.event.code}</span>
          <span className="micro-label !text-[0.52rem] text-muted-foreground">status {outcome.event.status.toLowerCase().replace(/_/g, " ")}</span>
          <Button size="sm" className="ml-auto rounded-lg bg-water text-white hover:bg-water-dim" onClick={() => navigate("event", outcome.event.code)}>
            Open event dossier <ChevronRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      </Reveal>

      <Reveal delay={0.26}>
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[0.62rem] text-slate-500">The wizard is locked after submission to keep one report per flow.</p>
          <Button variant="outline" size="sm" className="rounded-lg border-border text-slate-600 hover:bg-ink-850" onClick={onReset}>
            File another report
          </Button>
        </div>
      </Reveal>
    </div>
  );
}
