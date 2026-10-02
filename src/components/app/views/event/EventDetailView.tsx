"use client";

import { useUi, navigate } from "@/lib/client/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, ApiClientError, type EventSummary } from "@/lib/client/api";
import {
  LoadingRows, ErrorNote, Panel, EmptyState, StatusBadge, RiskBadge, RiskMeter, SeverityTicks,
  TimeAgo, ConfidenceChip, SourceBadge, ProviderChip, fmtDateTime, timeAgo,
} from "@/components/app/shared/domain";
import { MapView } from "@/components/app/map/MapView";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal, Stagger, StaggerItem, CountUp, PulseDot, AnimatedProgress } from "@/components/motion/kit";
import {
  ArrowLeft, RefreshCw, Camera, MapPin, Umbrella, HardHat, History, FileWarning, GitMerge, Network,
  MessageSquare, Wrench, Upload, FileSearch, Gauge, Sparkles, ListChecks, ClipboardCheck, ScrollText,
} from "lucide-react";
import { useState, useRef } from "react";
import { assetPath } from "@/lib/client/assets";

// URBAN EVENT DETAIL - full dossier: evidence, AI investigation, risk
// breakdown, responsibility, verification workflow, audit history.

interface EventDetailResponse {
  event: {
    id: string; code: string; title: string; category: string; status: string; severity: number;
    lat: number; lng: number; locationText: string; jurisdictionId: string | null; agencyCode: string | null;
    firstReportedAt: string; lastActivityAt: string; reportCount: number; recurrenceCount: number;
    riskScore: number; riskBand: string; riskModelVersion: string | null; riskAssessedAt: string | null;
    confidence: number; confidenceNote: string | null; classificationProvider: string | null; modelVersion: string | null;
    rainfall24hMm: number | null; rainfall72hMm: number | null; closedAt: string | null; reopenedAt: string | null;
    groundTruthHotspotId: string | null; groundTruthAgencyCode: string | null; source: string;
    jurisdiction: { id: string; code: string; name: string; kind: string; agencyCode: string | null } | null;
    reports: {
      id: string; publicRef: string; description: string; category: string; severityReported: string;
      submittedAt: string; channel: string; status: string; isDuplicate: boolean; source: string;
      classificationProvider: string | null; classificationConfidence: number | null;
      classification: {
        category: string; severity: string; confidence: number; summary: string;
        factors: string[]; isDuplicateSuspected: boolean; duplicateReason?: string;
      } | null;
    }[];
    evidence: {
      id: string; kind: string; caption: string | null; content: string; mediaType: string;
      capturedAt: string; capturedBy: string; lat: number | null; lng: number | null; source: string;
    }[];
    links: {
      id: string; agencyCode: string; role: string; status: string; reason: string | null;
      assignedAt: string; source: string;
      asset: { code: string; name: string; kind: string; conditionScore: number } | null;
    }[];
    actions: {
      id: string; kind: string; instruction: string; priority: string; status: string;
      agencyCode: string | null; assignedTo: string | null; assignedAt: string | null;
      dueAt: string | null; completedAt: string | null; outcome: string | null;
    }[];
    verifications: {
      id: string; stage: string; observedSeverity: string | null; waterDepthCm: number | null;
      notes: string | null; verifiedBy: string; verifiedAt: string;
    }[];
    riskFactors: { key: string; label: string; value: number; weight: number; contribution: number; raw: string }[];
  };
  context: {
    assets: { code: string; name: string; kind: string; agencyCode: string; lat: number; lng: number; conditionScore: number; lastInspectedAt: string | null }[];
    historicalIncidents: { id: string; lat: number; lng: number; occurredOn: string; severity: string; durationHours: number | null; waterDepthCm: number | null; reportedVia: string }[];
    maintenance: { kind: string; status: string; performedAt: string | null; scheduledAt: string; notes: string | null; agencyCode: string; asset: { code: string; name: string } | null }[];
    rainfallSeries: { t: string; mm: number }[];
  };
  riskHistory: { score: number; band: string; computedAt: string; provider: string; factors: { key: string; label: string; value: number; weight: number; contribution: number; raw: string }[] }[];
  auditHistory: { id: string; at: string; actor: string; action: string; note: string | null }[];
}

export function EventDetailView() {
  const eventId = useUi((s) => s.eventId);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  const detailQ = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiGet<EventDetailResponse>(`/api/events/${eventId}`).then((r) => r.data),
    enabled: !!eventId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event", eventId] });
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
    qc.invalidateQueries({ queryKey: ["risk"] });
  };

  const reassess = useMutation({
    mutationFn: () => apiPost<{ event: { riskScore: number; riskBand: string }; advisory: { provider: string } | null }>(`/api/events/${eventId}/reassess`, { useProvider: true }, "ANALYST"),
    onSuccess: (r) => {
      invalidate();
      toast({ title: "Risk reassessed", description: `New score ${r.data.event.riskScore} (${r.data.event.riskBand}). Advisory provider: ${r.data.advisory?.provider ?? "rule engine"}.` });
    },
    onError: (e) => toast({ title: "Reassessment failed", description: (e as ApiClientError).message, variant: "destructive" }),
  });

  if (!eventId) {
    return (
      <div className="flex-1 grid place-items-center">
        <EmptyState icon={<FileWarning className="size-8" />} title="No Event Selected" hint="Open an incident from the Command Center or the map." action={
          <Button variant="outline" size="sm" onClick={() => navigate("command")} className="mt-2 rounded-lg">← Command Center</Button>
        } />
      </div>
    );
  }
  if (detailQ.isLoading) return <div className="p-6"><LoadingRows rows={8} /></div>;
  if (detailQ.isError)
    return (
      <div className="p-6 max-w-lg">
        <ErrorNote message={(detailQ.error as Error).message} onRetry={() => detailQ.refetch()} />
        <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => navigate("command")}>← Back to Command Center</Button>
      </div>
    );

  if (!detailQ.data) return null;
  const { event, context, riskHistory, auditHistory } = detailQ.data;
  const d = { event, context, riskHistory, auditHistory } satisfies { event: EventDetailResponse["event"]; context: EventDetailResponse["context"]; riskHistory: EventDetailResponse["riskHistory"]; auditHistory: EventDetailResponse["auditHistory"] };


  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* header */}
      <Reveal className="hairline-b bg-ink-900 px-4 sm:px-6 py-3.5">
        <div className="flex items-start gap-3 flex-wrap">
          <button onClick={() => navigate(useUi.getState().view === "event" ? "command" : "map")} className="p-1.5 -ml-1.5 mt-0.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-ink-850 transition-colors" aria-label="Back">
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="data-mono text-sm font-semibold text-water">{event.code}</h1>
              <StatusBadge status={event.status} />
              <RiskBadge band={event.riskBand} score={event.riskScore} />
              <ConfidenceChip confidence={event.confidence} note={event.confidenceNote} />
              <SourceBadge source={event.source} />
            </div>
            <h2 className="mt-1.5 text-base sm:text-lg font-medium leading-snug text-slate-900">{event.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden /> {event.locationText}</span>
              <span className="data-mono">{event.lat.toFixed(4)}, {event.lng.toFixed(4)}</span>
              <span className="inline-flex items-center gap-1"><HardHat className="size-3" aria-hidden /> {event.agencyCode ?? "unassigned"}</span>
              <span>first report <TimeAgo iso={event.firstReportedAt} /></span>
              {event.status !== "CLOSED" && (
                <span className="inline-flex items-center gap-1.5" title="Last activity">
                  <PulseDot size={6} color="bg-verified" /> activity <TimeAgo iso={event.lastActivityAt} />
                </span>
              )}
              {event.jurisdiction && <span className="hidden sm:inline">{event.jurisdiction.name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              onClick={() => {
                useUi.getState().focusMap(event.lat, event.lng, 15);
                navigate("map");
              }}
              className="border-border rounded-lg"
            >
              <MapPin className="size-3.5" /> <span className="hidden sm:inline">Locate on map</span>
            </Button>
            <Button size="sm" onClick={() => reassess.mutateAsync()} disabled={reassess.isPending} className="rounded-lg bg-aqua text-ink-950 hover:bg-aqua-dim">
              <RefreshCw className={cn("size-3.5", reassess.isPending && "animate-spin")} />
              {reassess.isPending ? "Reassessing…" : "Reassess risk"}
            </Button>
          </div>
        </div>
        {event.confidenceNote && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700" role="note">
            {event.confidenceNote}
          </p>
        )}
      </Reveal>

      {/* body: mini map + tabs */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[340px_1fr] overflow-y-auto xl:overflow-hidden">
        <Reveal delay={0.06} className="xl:hairline-r bg-ink-900 flex flex-col xl:min-h-0">
          <div className="relative h-52 xl:h-64 shrink-0">
            <MapView events={[{
              id: event.id, code: event.code, title: event.title, category: event.category,
              status: event.status, severity: event.severity, lat: event.lat, lng: event.lng,
              locationText: event.locationText, jurisdictionId: event.jurisdictionId, agencyCode: event.agencyCode,
              firstReportedAt: event.firstReportedAt, lastActivityAt: event.lastActivityAt,
              reportCount: event.reportCount, recurrenceCount: event.recurrenceCount,
              riskScore: event.riskScore, riskBand: event.riskBand as EventSummary["riskBand"],
              riskModelVersion: event.riskModelVersion, riskAssessedAt: event.riskAssessedAt,
              confidence: event.confidence, confidenceNote: event.confidenceNote,
              classificationProvider: event.classificationProvider, modelVersion: event.modelVersion,
              rainfall24hMm: event.rainfall24hMm, rainfall72hMm: event.rainfall72hMm,
              closedAt: event.closedAt, reopenedAt: event.reopenedAt,
              groundTruthHotspotId: event.groundTruthHotspotId, source: event.source,
            }]} initialZoom={14.2} />
            <div className="absolute top-2 left-2 rounded-md bg-ink-950/85 px-2 py-1 shadow-sm ring-1 ring-border/70 pointer-events-none backdrop-blur-sm">
              <p className="micro-label text-[0.55rem]!">Event Focus</p>
            </div>
          </div>
          <QuickFacts d={d} />
        </Reveal>

        <Reveal delay={0.1} className="min-h-0 overflow-y-auto xl:overflow-hidden p-3 sm:p-4">
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col h-full min-h-0">
            <TabsList className="bg-ink-850 w-full justify-start overflow-x-auto rounded-lg no-scrollbar h-9">
              <DossierTab value="overview" current={tab}>Overview</DossierTab>
              <DossierTab value="evidence" current={tab}>Evidence ({event.evidence.length})</DossierTab>
              <DossierTab value="investigation" current={tab}>AI Investigation</DossierTab>
              <DossierTab value="response" current={tab}>Response & Verification</DossierTab>
              <DossierTab value="audit" current={tab}>Audit</DossierTab>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-0.5">
              <TabsContent value="overview" className="mt-0 space-y-3">
                <OverviewTab d={d} />
              </TabsContent>
              <TabsContent value="evidence" className="mt-0 space-y-3">
                <EvidenceTab d={d} onMutated={invalidate} />
              </TabsContent>
              <TabsContent value="investigation" className="mt-0 space-y-3">
                <InvestigationTab d={d} />
              </TabsContent>
              <TabsContent value="response" className="mt-0 space-y-3">
                <ResponseTab d={d} onMutated={invalidate} />
              </TabsContent>
              <TabsContent value="audit" className="mt-0 space-y-3">
                <AuditTab d={d} />
              </TabsContent>
            </div>
          </Tabs>
        </Reveal>
      </div>
    </div>
  );
}

/** Tab trigger with an OriginKit-style sliding white pill (layout animation). */
function DossierTab({ value, current, children }: { value: string; current: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const active = value === current;
  return (
    <TabsTrigger
      value={value}
      className={cn(
        "relative rounded-md text-xs font-medium text-slate-500 hover:text-slate-700 data-[state=active]:text-slate-900",
        reduce
          ? "data-[state=active]:bg-ink-850 data-[state=active]:shadow-sm"
          : "data-[state=active]:bg-transparent data-[state=active]:shadow-none"
      )}
    >
      {active && !reduce && (
        <motion.span
          layoutId="dossier-tab-indicator"
          className="absolute inset-0 rounded-md bg-ink-850 shadow-sm"
          aria-hidden
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </TabsTrigger>
  );
}

type D = { event: EventDetailResponse["event"]; context: EventDetailResponse["context"]; riskHistory: EventDetailResponse["riskHistory"]; auditHistory: EventDetailResponse["auditHistory"] };

function QuickFacts({ d }: { d: D }) {
  const e = d.event;
  return (
    <div className="p-4 space-y-4 xl:overflow-y-auto">
      <div>
        <p className="micro-label mb-1.5">Risk</p>
        <RiskMeter score={e.riskScore} band={e.riskBand} />
        <p className="mt-1 micro-label text-[0.52rem]! text-muted-foreground/70">
          {e.riskModelVersion} · assessed {e.riskAssessedAt ? timeAgo(e.riskAssessedAt) : "-"}
        </p>
      </div>
      <dl className="space-y-2 text-xs">
        <Fact label="Severity" value={<SeverityTicks severity={e.severity} />} />
        <Fact label="Reports" value={<span className="data-mono"><CountUp value={e.reportCount} /> ({e.reports.filter((r) => r.isDuplicate).length} merged)</span>} />
        <Fact label="Recurrence" value={<span className="data-mono"><CountUp value={e.recurrenceCount} />×</span>} />
        <Fact label="Rainfall 24h/72h" value={<span className="data-mono text-water">{Math.round(e.rainfall24hMm ?? 0)} / {Math.round(e.rainfall72hMm ?? 0)} mm</span>} />
        <Fact label="Category" value={<span className="data-mono">{e.category.toLowerCase()}</span>} />
        <Fact label="Classification" value={<ProviderChip provider={e.classificationProvider ?? "-"} model={e.modelVersion} />} />
        {e.groundTruthHotspotId && (
          <Fact label="Ground Truth" value={<span className="text-[0.65rem] text-sev-moderate">{e.groundTruthHotspotId} · {e.groundTruthAgencyCode} (synthetic)</span>} />
        )}
      </dl>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="micro-label text-[0.55rem]!">{label}</dt>
      <dd className="flex items-center">{value}</dd>
    </div>
  );
}

// --- Overview tab -----------------------------------------------------------------

function OverviewTab({ d }: { d: D }) {
  const { event: e, context } = d;
  const nearbyAssets = context.assets
    .map((a) => ({ ...a, d: Math.round(hav({ lat: e.lat, lng: e.lng }, a)) }))
    .filter((a) => a.d <= 600)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  const nearIncidents = context.historicalIncidents
    .map((i) => ({ ...i, d: Math.round(hav({ lat: e.lat, lng: e.lng }, i)) }))
    .filter((i) => i.d <= 300)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
    .slice(0, 5);
  const nearMaint = context.maintenance
    .filter((m) => m.asset && nearbyAssets.some((a) => a.code === m.asset?.code))
    .slice(0, 4);

  return (
    <>
      <Reveal>
        <Panel title={`Citizen Reports · ${e.reportCount}`} icon={<MessageSquare />}>
          <Stagger className="divide-y divide-border/60">
            {e.reports.map((r) => (
              <StaggerItem key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="data-mono text-[0.65rem] text-water">{r.publicRef}</span>
                  <span className="micro-label text-[0.52rem]!">{r.channel.toLowerCase()}</span>
                  {r.isDuplicate && <span className="micro-label text-[0.52rem]! text-sev-moderate" title="This report described the same incident, so it was counted inside this event instead of separately">merged as duplicate</span>}
                  <TimeAgo iso={r.submittedAt} />
                </div>
                <p className="mt-1 text-[0.82rem] text-slate-700 leading-relaxed">{r.description}</p>
                {r.classification && (
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[0.65rem] text-muted-foreground">
                    <span>assessed <span className={cn("font-medium", sevClass(r.classification.severity))}>{r.classification.severity.toLowerCase()}</span></span>
                    <span className="data-mono">conf {Math.round(r.classification.confidence * 100)}%</span>
                    {r.classificationProvider && <ProviderChip provider={r.classificationProvider} />}
                  </div>
                )}
              </StaggerItem>
            ))}
          </Stagger>
        </Panel>
      </Reveal>

      <Reveal delay={0.06}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Panel title="Infrastructure Context · Within 600m" icon={<Network />}>
            {nearbyAssets.length === 0 ? (
              <EmptyState title="No Assets Recorded Nearby" hint="The infrastructure list covers pilot areas only (synthetic)." />
            ) : (
              <ul className="space-y-2">
                {nearbyAssets.map((a) => (
                  <li key={a.code} className="flex items-center gap-2.5 text-xs">
                    <span className="data-mono text-[0.62rem] text-muted-foreground w-12 shrink-0">{a.d}m</span>
                    <span className={cn("size-2 rounded-full shrink-0", a.conditionScore < 45 ? "bg-sev-high" : a.conditionScore < 65 ? "bg-sev-moderate" : "bg-verified")} aria-hidden />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-slate-700">{a.name}</span>
                      <span className="micro-label text-[0.5rem]!">{a.kind.toLowerCase().replace(/_/g, " ")} · {a.agencyCode} · condition {a.conditionScore}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Historical Incidents · Within 300m" icon={<History />}>
            {nearIncidents.length === 0 ? (
              <EmptyState title="No Historical Incidents Nearby" hint="The historical archive is synthetic and covers pilot areas only." />
            ) : (
              <ul className="space-y-2">
                {nearIncidents.map((i) => (
                  <li key={i.id} className="flex items-baseline gap-2.5 text-xs">
                    <span className="data-mono text-[0.62rem] text-muted-foreground shrink-0 w-20">{new Date(i.occurredOn).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
                    <span className={cn("font-medium shrink-0", sevClass(i.severity))}>{i.severity.toLowerCase()}</span>
                    <span className="text-muted-foreground truncate">{i.waterDepthCm ?? "?"}cm · {i.durationHours?.toFixed(0) ?? "?"}h · {i.reportedVia.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Panel title="Maintenance Nearby" icon={<Wrench />}>
            {nearMaint.length === 0 ? (
              <EmptyState title="No Maintenance Records for Nearby Assets" />
            ) : (
              <ul className="space-y-2">
                {nearMaint.map((m, i) => (
                  <li key={i} className="flex items-baseline gap-2.5 text-xs">
                    <span className="data-mono text-[0.62rem] text-muted-foreground w-20 shrink-0">
                      {m.performedAt ? new Date(m.performedAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "scheduled"}
                    </span>
                    <span className="flex-1 truncate text-slate-700">{m.asset?.name ?? "asset"} · {m.kind.toLowerCase()}</span>
                    <span className={cn("micro-label text-[0.5rem]!", m.status === "COMPLETED" ? "text-verified" : "text-water")}>{m.status.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Rainfall · 72h (Synthetic)" icon={<Umbrella />}>
            <ul className="space-y-1.5 text-xs">
              {context.rainfallSeries.slice(-12).map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="data-mono text-[0.6rem] text-muted-foreground w-11 shrink-0">{new Date(s.t).toLocaleTimeString("en-IN", { hour: "2-digit", hour12: false })}</span>
                  <AnimatedProgress value={Math.min(100, s.mm * 3)} max={100} className="flex-1 h-1.5" fillClassName="bg-water-dim" delay={i * 0.04} />
                  <span className="data-mono text-[0.62rem]">{s.mm}mm</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </Reveal>
    </>
  );
}

// --- Evidence tab ------------------------------------------------------------------

function EvidenceTab({ d, onMutated }: { d: D; onMutated: () => void }) {
  const { event: e } = d;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [kind, setKind] = useState<"FIELD_PHOTO" | "FIELD_NOTE">("FIELD_PHOTO");
  const [noteText, setNoteText] = useState("");
  const [uploading, setUploading] = useState(false);

  const upload = useMutation({
    mutationFn: async (payload: { kind: string; caption: string; content: string; mediaType: string }) =>
      apiPost(`/api/events/${e.id}/verify`, { stage: "EVIDENCE_UPLOADED", notes: payload.caption, photoDataUrl: kind === "FIELD_PHOTO" ? payload.content : undefined, photoCaption: payload.caption }, "FIELD_TEAM"),
    onSuccess: () => {
      onMutated();
      toast({ title: "Evidence attached", description: "Field evidence recorded in the event dossier." });
      setCaption("");
      setNoteText("");
    },
    onError: (err) => toast({ title: "Upload failed", description: (err as ApiClientError).message, variant: "destructive" }),
  });

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file, 1024, 0.7);
      upload.mutate({ kind: "FIELD_PHOTO", caption: caption || `Field photo (${file.name})`, content: dataUrl, mediaType: "image/jpeg" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <Reveal>
        <Panel title={`Evidence Chain · ${e.evidence.length} Items`} icon={<Camera />}>
          {e.evidence.length === 0 ? (
            <EmptyState icon={<Camera className="size-7" />} title="No Evidence Yet" hint="Field teams can attach photos and notes here. The system adds its own AI summaries automatically." />
          ) : (
            <Stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {e.evidence.map((ev) => (
                <StaggerItem key={ev.id}>
                  <figure className="group">
                    <div className="relative rounded-lg overflow-hidden border border-border/70 aspect-4/3 bg-ink-850">
                      {ev.mediaType.startsWith("image/") ? (
                        <img
                          src={ev.content.startsWith("data:") ? ev.content : assetPath(ev.content)}
                          alt={ev.caption ?? `${ev.kind} evidence`}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                          onError={(el) => {
                            el.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="size-full p-2.5 overflow-auto">
                          <p className="text-[0.6rem] data-mono text-muted-foreground wrap-break-word">{ev.content.slice(0, 260)}</p>
                        </div>
                      )}
                      <span className="absolute top-1 left-1 rounded-md bg-ink-950/85 px-1.5 py-0.5 micro-label text-[0.48rem]! text-slate-300 shadow-sm backdrop-blur-sm">
                        {ev.kind.toLowerCase().replace(/_/g, " ")}
                      </span>
                    </div>
                    <figcaption className="mt-1.5 text-[0.65rem] text-muted-foreground leading-snug">
                      <span className="block truncate">{ev.caption ?? "-"}</span>
                      <span className="micro-label text-[0.48rem]! text-muted-foreground/60!">{ev.capturedBy.toLowerCase()} · {fmtDateTime(ev.capturedAt)}</span>
                    </figcaption>
                  </figure>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </Panel>
      </Reveal>

      <Reveal delay={0.06}>
        <Panel title="Attach Field Evidence" icon={<Upload />}>
          <div className="space-y-3 max-w-lg">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                  <SelectTrigger className="h-9 bg-ink-900 border-border text-xs" aria-label="Evidence type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIELD_PHOTO" className="text-xs">Field photo</SelectItem>
                    <SelectItem value="FIELD_NOTE" className="text-xs">Field note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-caption" className="text-xs">Caption</Label>
                <Input id="ev-caption" value={caption} onChange={(e2) => setCaption(e2.target.value)} placeholder="e.g. before intervention, drain intake blocked" className="h-9 bg-ink-900 border-border text-xs" maxLength={120} />
              </div>
            </div>
            {kind === "FIELD_PHOTO" ? (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  id="evidence-file"
                  onChange={(e2) => e2.target.files?.[0] && onFile(e2.target.files[0])}
                />
                <Button type="button" variant="outline" size="sm" disabled={uploading || upload.isPending} onClick={() => fileRef.current?.click()} className="border-border rounded-lg">
                  <Camera className="size-3.5" /> {uploading || upload.isPending ? "Processing…" : "Select photo"}
                </Button>
                <p className="mt-1.5 text-[0.65rem] text-muted-foreground">Photos are automatically shrunk to 1024px or smaller and saved in the demo database.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="note-text" className="text-xs">Note</Label>
                <Textarea id="note-text" value={noteText} onChange={(e2) => setNoteText(e2.target.value)} rows={3} className="bg-ink-900 border-border text-xs" placeholder="Field observation…" maxLength={600} />
                <Button size="sm" disabled={!noteText.trim() || upload.isPending} onClick={() => upload.mutate({ kind: "FIELD_NOTE", caption: caption || "Field note", content: noteText, mediaType: "text/plain" })} className="rounded-lg">
                  Attach note
                </Button>
              </div>
            )}
          </div>
        </Panel>
      </Reveal>
    </>
  );
}

// --- AI Investigation tab -------------------------------------------------------------

function InvestigationTab({ d }: { d: D }) {
  const { event: e } = d;
  const latestReport = e.reports.find((r) => r.classification);
  const cl = latestReport?.classification ?? null;
  const riskFactors = e.riskFactors ?? [];
  const aiEvidence = e.evidence.filter((ev) => ev.kind === "AI_OUTPUT");

  return (
    <>
      {cl && (
        <Reveal>
          <Panel title="Classification · Structured Model Output" icon={<FileSearch />} actions={<ProviderChip provider={latestReport?.classificationProvider ?? "-"} model={e.modelVersion} />}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <Readout label="Category" value={cl.category.toLowerCase().replace(/_/g, " ")} />
              <Readout label="Severity" value={cl.severity.toLowerCase()} tone={sevClass(cl.severity)} />
              <Readout label="Confidence" value={<CountUp value={Math.round(cl.confidence * 100)} suffix="%" />} />
            </div>
            <p className="text-sm text-slate-700 leading-relaxed border-l-2 border-water/50 pl-3">{cl.summary}</p>
            {cl.factors.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {cl.factors.map((f, i) => (
                  <li key={i} className="rounded-full border border-border/70 bg-slate-50 px-2 py-0.5 text-[0.65rem] text-slate-600">{f}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 micro-label text-[0.5rem]! text-muted-foreground/60">
              Structured output only. No chain-of-thought is exposed or stored.
            </p>
          </Panel>
        </Reveal>
      )}

      <Reveal delay={0.06}>
        <Panel title={`Risk Assessment · ${e.riskModelVersion ?? "risk-engine"}`} icon={<Gauge />} actions={<RiskBadge band={e.riskBand} score={e.riskScore} />}>
          <div className="space-y-2.5 max-w-2xl">
            {riskFactors.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-36 sm:w-44 shrink-0 text-xs text-slate-700 truncate" title={f.label}>{f.label}</span>
                <AnimatedProgress
                  value={f.contribution}
                  max={20}
                  className="flex-1 h-2"
                  fillClassName={f.contribution > 12 ? "bg-sev-high" : f.contribution > 7 ? "bg-sev-moderate" : "bg-water-dim"}
                />
                <span className="sr-only">{f.label}: contribution {f.contribution} of 100</span>
                <span className="data-mono text-[0.65rem] w-10 text-right text-foreground">{f.contribution.toFixed(1)}</span>
                <span className="data-mono text-[0.6rem] w-20 text-right text-muted-foreground hidden sm:block" title={`raw: ${f.raw}`}>{f.raw}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.68rem] text-muted-foreground">
            The score adds up each factor (value × weight) and scales the total to 0–100. Weights: severity 0.20, rainfall 0.18, reports 0.16, recurrence 0.14, infrastructure 0.12, maintenance 0.10, history 0.10.
          </p>
        </Panel>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Panel title="Duplicate & Recurrence Analysis" icon={<GitMerge />}>
            <ul className="space-y-2 text-xs">
              {e.reports.filter((r) => r.isDuplicate).length > 0 ? (
                e.reports.filter((r) => r.isDuplicate).map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <GitMerge className="size-3.5 text-water shrink-0" aria-hidden />
                    <span className="data-mono text-water">{r.publicRef}</span>
                    <span className="text-muted-foreground">merged: same spot (within 150m) and time (48h)</span>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">No merged duplicates in this event.</li>
              )}
              {e.recurrenceCount > 0 && (
                <li className="flex items-center gap-2 text-sev-high">
                  <RefreshCw className="size-3.5 shrink-0" aria-hidden />
                  <span>Recurred {e.recurrenceCount}× {e.reopenedAt ? `· reopened ${timeAgo(e.reopenedAt)}` : ""}</span>
                </li>
              )}
              {cl?.isDuplicateSuspected && cl.duplicateReason && (
                <li className="text-sev-moderate">Model suspects further duplication: {cl.duplicateReason}</li>
              )}
            </ul>
          </Panel>

          <Panel title="Risk History" icon={<History />}>
            <ul className="space-y-2">
              {d.riskHistory.length === 0 ? (
                <li className="text-xs text-muted-foreground">No assessments recorded.</li>
              ) : (
                d.riskHistory.slice(0, 6).map((r, i) => (
                  <li key={i} className="flex items-center gap-3 text-xs">
                    <span className="data-mono text-muted-foreground w-20 shrink-0">{timeAgo(r.computedAt)}</span>
                    <RiskBadge band={r.band} score={r.score} />
                    <span className="micro-label text-[0.5rem]! text-muted-foreground">{r.provider.toLowerCase()}</span>
                  </li>
                ))
              )}
            </ul>
          </Panel>
        </div>
      </Reveal>

      {aiEvidence.length > 0 && (
        <Reveal delay={0.18}>
          <Panel title="AI Risk Advisories · Structured Outputs" icon={<Sparkles />}>
            <div className="space-y-3">
              {aiEvidence.map((ev) => {
                let parsed: { narrative: string; factors?: { key: string; label: string; direction: string; weight: number }[]; recommendedInvestigation?: string } | null = null;
                try {
                  parsed = JSON.parse(ev.content);
                } catch {
                  parsed = null;
                }
                return (
                  <div key={ev.id} className="rounded-lg border border-border bg-slate-50 p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <ProviderChip provider={ev.source === "MODEL_OUTPUT" ? "GLM" : "MOCK"} />
                      <TimeAgo iso={ev.capturedAt} />
                    </div>
                    {parsed && (
                      <>
                        <p className="text-[0.82rem] text-slate-700 leading-relaxed">{parsed.narrative}</p>
                        {parsed.factors && parsed.factors.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {parsed.factors.map((f, i) => (
                              <li key={i} className={cn(
                                "rounded-full border px-2 py-0.5 text-[0.62rem] font-medium",
                                f.direction === "AGGRAVATES" ? "border-orange-200 bg-orange-50 text-sev-high" : "border-emerald-200 bg-emerald-50 text-verified"
                              )}>
                                {f.label} · w {f.weight.toFixed(2)}
                              </li>
                            ))}
                          </ul>
                        )}
                        {parsed.recommendedInvestigation && (
                          <p className="mt-2 text-xs text-water">Recommended: {parsed.recommendedInvestigation}</p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </Reveal>
      )}
    </>
  );
}

// --- Response tab (responsibility + actions + verification) ------------------------------

function ResponseTab({ d, onMutated }: { d: D; onMutated: () => void }) {
  const { event: e } = d;
  const { toast } = useToast();
  const qc = useQueryClient();

  const actionUpdate = useMutation({
    mutationFn: (p: { actionId: string; status: string; outcome?: string }) => apiPut(`/api/events/${e.id}/actions`, p, "AGENCY"),
    onSuccess: () => {
      onMutated();
      toast({ title: "Action updated" });
    },
    onError: (err) => toast({ title: "Update failed", description: (err as ApiClientError).message, variant: "destructive" }),
  });

  const verify = useMutation({
    mutationFn: (p: Record<string, unknown>) => apiPost(`/api/events/${e.id}/verify`, p, "FIELD_TEAM"),
    onSuccess: () => {
      onMutated();
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast({ title: "Verification stage recorded" });
    },
    onError: (err) => toast({ title: "Verification failed", description: (err as ApiClientError).message, variant: "destructive" }),
  });

  const reopen = useMutation({
    mutationFn: (p: { reopenReason: string }) => apiPut(`/api/events/${e.id}/verify`, p, "AGENCY"),
    onSuccess: () => {
      onMutated();
      toast({ title: "Event reopened", description: "Recurrence watch incremented." });
    },
    onError: (err) => toast({ title: "Reopen failed", description: (err as ApiClientError).message, variant: "destructive" }),
  });

  const assign = useMutation({
    mutationFn: (p: { agencyCode: string; role: string; note?: string }) => apiPost(`/api/events/${e.id}/assign`, p, "ANALYST"),
    onSuccess: () => {
      onMutated();
      toast({ title: "Responsibility assigned" });
    },
    onError: (err) => toast({ title: "Assignment failed", description: (err as ApiClientError).message, variant: "destructive" }),
  });

  return (
    <>
      <Reveal>
        <Panel title="Responsibility Chain" icon={<Network />} actions={<span className="micro-label text-[0.5rem]! text-muted-foreground/60">routing-rules v1.2</span>}>
          <ol className="space-y-0">
            <ChainLevel level="EVENT" label={e.code} detail={`${e.reportCount} reports · risk ${e.riskScore} (${e.riskBand})`} />
            <ChainLevel level="JURISDICTION" label={e.jurisdiction?.name ?? "-"} detail={e.jurisdiction ? `${e.jurisdiction.kind.toLowerCase()} · administered by ${e.jurisdiction.agencyCode ?? "n/a"}` : "outside pilot"} />
            {e.links.map((l) => (
              <ChainLevel
                key={l.id}
                level={l.role}
                label={l.agencyCode}
                detail={l.reason ?? ""}
                asset={l.asset ? `${l.asset.name} · condition ${l.asset.conditionScore}` : null}
                status={l.status}
                source={l.source}
              />
            ))}
          </ol>
          <AssignForm onAssign={(p) => assign.mutateAsync(p)} pending={assign.isPending} />
          {e.groundTruthAgencyCode && (
            <p className="mt-3 text-[0.65rem] text-sev-moderate">
              Routing evaluation note: seeded ground truth for this location is <span className="data-mono">{e.groundTruthAgencyCode}</span> (synthetic label for research metrics).
            </p>
          )}
        </Panel>
      </Reveal>

      <Reveal delay={0.06}>
        <Panel title={`Action Items · ${e.actions.length}`} icon={<ListChecks />}>
          {e.actions.length === 0 ? (
            <EmptyState title="No Action Items" hint="Suggested actions appear here once the system sorts (triages) the incident." />
          ) : (
            <ul>
              <Stagger className="space-y-2">
                {e.actions.map((a) => (
                  <StaggerItem key={a.id}>
                    <li className="rounded-lg border border-border bg-slate-50 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="data-mono text-[0.62rem] font-semibold text-water">{a.kind.replace(/_/g, " ").toLowerCase()}</span>
                      <span className={cn("micro-label text-[0.5rem]!", a.priority === "URGENT" ? "text-sev-critical" : a.priority === "HIGH" ? "text-sev-high" : "text-muted-foreground")}>{a.priority.toLowerCase()}</span>
                      <span className="ml-auto data-mono text-[0.62rem] text-muted-foreground">{a.agencyCode ?? "-"}{a.assignedTo ? ` · ${a.assignedTo}` : ""}</span>
                    </div>
                    <p className="mt-1 text-[0.8rem] text-slate-700">{a.instruction}</p>
                    {a.outcome && <p className="mt-1 text-xs text-verified/90">Outcome: {a.outcome}</p>}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className={cn("micro-label text-[0.5rem]!", a.status === "COMPLETED" ? "text-verified" : a.status === "FAILED" ? "text-sev-critical" : "text-water")}>
                        {a.status.toLowerCase().replace(/_/g, " ")}
                      </span>
                      {a.assignedAt && <span className="text-[0.62rem] text-muted-foreground">assigned {timeAgo(a.assignedAt)}</span>}
                      {a.completedAt && <span className="text-[0.62rem] text-muted-foreground">· done {timeAgo(a.completedAt)}</span>}
                      {(a.status === "RECOMMENDED" || a.status === "ASSIGNED") && (
                        <div className="ml-auto flex gap-1.5">
                          {a.status === "RECOMMENDED" && (
                            <Button size="sm" variant="outline" className="h-7 text-[0.65rem] border-border rounded-lg" onClick={() => actionUpdate.mutate({ actionId: a.id, status: "ASSIGNED" })}>
                              accept
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-[0.65rem] border-border rounded-lg" onClick={() => actionUpdate.mutate({ actionId: a.id, status: "IN_PROGRESS" })}>
                            start
                          </Button>
                          <Button size="sm" className="h-7 text-[0.65rem] rounded-lg bg-verified text-ink-950 hover:bg-emerald-600" onClick={() => actionUpdate.mutate({ actionId: a.id, status: "COMPLETED", outcome: "Completed via event dossier." })}>
                            complete
                          </Button>
                        </div>
                      )}
                    </div>
                    </li>
                  </StaggerItem>
                ))}
              </Stagger>
            </ul>
          )}
        </Panel>
      </Reveal>

      <Reveal delay={0.12}>
        <Panel title="Field Verification Workflow" icon={<ClipboardCheck />}>
          <VerificationStepper stages={e.verifications.map((v) => v.stage)} />
          <VerificationTimeline verifications={e.verifications} />
          <VerificationForms
            event={e}
            onVerify={(p) => verify.mutateAsync(p)}
            onReopen={(reason) => reopen.mutateAsync({ reopenReason: reason })}
            pending={verify.isPending}
          />
        </Panel>
      </Reveal>
    </>
  );
}

function AssignForm({ onAssign, pending }: { onAssign: (p: { agencyCode: string; role: string; note?: string }) => Promise<unknown>; pending: boolean }) {
  const [agency, setAgency] = useState("PWD");
  const [role, setRole] = useState("PRIMARY");
  const [note, setNote] = useState("");
  const agencies = ["MCD", "PWD", "NDMC", "DJB", "IFC", "DDMA", "DCP"];
  return (
    <div className="mt-4 pt-3 hairline-t">
      <p className="micro-label mb-2">Assign / Escalate Manually</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label htmlFor="asg-agency" className="text-[0.65rem]">Agency</Label>
          <Select value={agency} onValueChange={setAgency}>
            <SelectTrigger id="asg-agency" className="h-8 w-28 bg-ink-900 border-border text-xs" aria-label="Agency"><SelectValue /></SelectTrigger>
            <SelectContent>
              {agencies.map((a) => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="asg-role" className="text-[0.65rem]">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="asg-role" className="h-8 w-32 bg-ink-900 border-border text-xs" aria-label="Role"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["PRIMARY", "SUPPORT", "ESCALATION"].map((r) => <SelectItem key={r} value={r} className="text-xs">{r.toLowerCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional)" className="h-8 w-44 bg-ink-900 border-border text-xs" maxLength={200} aria-label="Assignment note" />
        <Button size="sm" disabled={pending} onClick={() => onAssign({ agencyCode: agency, role, note: note || undefined })} className="h-8 rounded-lg bg-aqua text-ink-950 hover:bg-aqua-dim">
          {pending ? "Assigning…" : "Assign"}
        </Button>
      </div>
    </div>
  );
}

const VERIFICATION_STAGES = ["ASSIGNED", "DISPATCHED", "OBSERVED", "EVIDENCE_UPLOADED", "ACTION_RECORDED", "VERIFIED", "CLOSED"] as const;

function VerificationStepper({ stages }: { stages: string[] }) {
  const reached = new Set(stages);
  const currentIdx = VERIFICATION_STAGES.findIndex((s) => !reached.has(s));
  return (
    <ol className="flex items-center gap-0 overflow-x-auto no-scrollbar pb-1" aria-label="Verification progress">
      {VERIFICATION_STAGES.map((s, i) => {
        const done = reached.has(s);
        const current = i === currentIdx;
        return (
          <li key={s} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1 w-16">
              <span
                className={cn(
                  "size-4 rounded-full border-2 grid place-items-center transition-colors",
                  done ? "bg-verified border-verified" : current ? "border-water" : "border-border"
                )}
                aria-hidden
              >
                {done && <span className="size-1.5 rounded-full bg-ink-950" />}
              </span>
              <span className={cn("micro-label text-[0.46rem]! text-center leading-tight", done ? "text-verified" : current ? "text-water" : "text-muted-foreground/60")}>
                {s.toLowerCase().replace(/_/g, " ")}
              </span>
            </div>
            {i < VERIFICATION_STAGES.length - 1 && (
              <span className={cn("h-0.5 w-4 sm:w-6", done ? "bg-verified/60" : "bg-border")} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function VerificationTimeline({ verifications }: { verifications: D["event"]["verifications"] }) {
  if (verifications.length === 0) {
    return <p className="mt-4 text-xs text-muted-foreground">No verification stages recorded yet.</p>;
  }
  return (
    <ol className="mt-4 space-y-0 relative">
      {verifications.map((v, i) => (
        <li key={v.id} className="relative pl-5 pb-3 last:pb-0">
          <span className={cn("absolute left-0 top-1 size-2.5 rounded-full", v.stage === "VERIFIED" || v.stage === "CLOSED" ? "bg-verified" : "bg-water-dim")} aria-hidden />
          {i < verifications.length - 1 && <span className="absolute left-[4.5px] top-3.5 bottom-0 w-px bg-border" aria-hidden />}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="micro-label text-[0.52rem]!">{v.stage.toLowerCase().replace(/_/g, " ")}</span>
            <span className="text-[0.62rem] text-muted-foreground">{v.verifiedBy.toLowerCase()} · {fmtDateTime(v.verifiedAt)}</span>
          </div>
          {v.notes && <p className="mt-0.5 text-xs text-slate-600">{v.notes}</p>}
          {(v.waterDepthCm != null || v.observedSeverity) && (
            <p className="mt-0.5 text-[0.65rem] data-mono text-muted-foreground">
              {v.waterDepthCm != null && <>depth {v.waterDepthCm}cm </>}
              {v.observedSeverity && <>· observed {v.observedSeverity.toLowerCase()}</>}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function VerificationForms({ event, onVerify, onReopen, pending }: {
  event: D["event"];
  onVerify: (p: Record<string, unknown>) => Promise<unknown>;
  onReopen: (reason: string) => Promise<unknown>;
  pending: boolean;
}) {
  const [stage, setStage] = useState<string>("DISPATCHED");
  const [observedSeverity, setObservedSeverity] = useState<string>("MEDIUM");
  const [depth, setDepth] = useState("");
  const [notes, setNotes] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const reached = new Set(event.verifications.map((v) => v.stage));
  const nextStage = VERIFICATION_STAGES.find((s) => !reached.has(s));
  const effectiveStage = nextStage ?? "CLOSED";
  const closed = event.status === "CLOSED";
  const canClose = reached.has("VERIFIED") || nextStage === "VERIFIED" || nextStage === "CLOSED";

  if (closed) {
    return (
      <div className="mt-4 pt-3 hairline-t space-y-2">
        <p className="text-xs text-muted-foreground">Event closed {event.closedAt ? timeAgo(event.closedAt) : ""}. New citizen reports at this location will reopen it automatically (recurrence watch).</p>
        <div className="flex gap-2 items-end">
          <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="manual reopen reason (e.g. re-flooding reported via hotline)" rows={2} className="bg-ink-900 border-border text-xs flex-1" maxLength={300} aria-label="Reopen reason" />
          <Button size="sm" variant="outline" disabled={reopenReason.trim().length < 4 || pending} onClick={() => onReopen(reopenReason.trim())} className="h-9 rounded-lg border-red-200 text-sev-critical hover:bg-red-50">
            Reopen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 hairline-t">
      <p className="micro-label mb-2">Record Verification Stage</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="space-y-1">
          <Label className="text-[0.65rem]">Stage</Label>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="h-8 bg-ink-900 border-border text-xs" aria-label="Stage"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VERIFICATION_STAGES.filter((s) => s !== "ASSIGNED" || !reached.has("ASSIGNED")).map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s.toLowerCase().replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[0.65rem]">Observed Severity</Label>
          <Select value={observedSeverity} onValueChange={setObservedSeverity}>
            <SelectTrigger className="h-8 bg-ink-900 border-border text-xs" aria-label="Observed severity"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <SelectItem key={s} value={s} className="text-xs">{s.toLowerCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="vf-depth" className="text-[0.65rem]">Water depth (cm)</Label>
          <Input id="vf-depth" inputMode="numeric" value={depth} onChange={(e) => setDepth(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 35" className="h-8 bg-ink-900 border-border text-xs" maxLength={3} />
        </div>
        <div className="space-y-1 self-end">
          <Button size="sm" disabled={pending || !stage} onClick={() =>
            onVerify({
              stage,
              observedSeverity,
              waterDepthCm: depth ? Number(depth) : undefined,
              notes: notes || undefined,
            })
          } className="w-full h-8 rounded-lg bg-aqua text-ink-950 hover:bg-aqua-dim">
            {pending ? "Recording…" : "Record stage"}
          </Button>
        </div>
      </div>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="field notes (optional)" className="mt-2.5 bg-ink-900 border-border text-xs" maxLength={600} aria-label="Field notes" />
      <p className="mt-1.5 text-[0.62rem] text-muted-foreground">
        Next expected stage: <span className="text-water">{effectiveStage.toLowerCase().replace(/_/g, " ")}</span>. Stages must be recorded in order.
      </p>
    </div>
  );
}

// --- Audit tab -----------------------------------------------------------------------

function AuditTab({ d }: { d: D }) {
  return (
    <Reveal>
      <Panel title={`Audit History · ${d.auditHistory.length} Entries`} icon={<ScrollText />}>
        {d.auditHistory.length === 0 ? (
          <EmptyState title="No Audit Entries" />
        ) : (
          <ol className="relative">
            <Stagger>
              {d.auditHistory.map((a) => (
                <StaggerItem key={a.id}>
                  <li className="relative pl-5 py-2 hairline-b last:border-0">
                    <span className={cn("absolute left-0 top-3.5 size-1.5 rounded-full", a.actor === "SYSTEM" ? "bg-muted-foreground" : a.actor === "CITIZEN" ? "bg-water-dim" : "bg-sev-moderate")} aria-hidden />
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="data-mono text-[0.65rem] text-water">{a.action}</span>
                      <span className="micro-label text-[0.5rem]!">{a.actor.toLowerCase()}</span>
                      <span className="ml-auto"><TimeAgo iso={a.at} /></span>
                    </div>
                    {a.note && <p className="text-xs text-muted-foreground mt-0.5">{a.note}</p>}
                  </li>
                </StaggerItem>
              ))}
            </Stagger>
          </ol>
        )}
      </Panel>
    </Reveal>
  );
}

// --- helpers ---------------------------------------------------------------------------

function ChainLevel({ level, label, detail, asset, status, source }: {
  level: string; label: string; detail: string; asset?: string | null; status?: string; source?: string;
}) {
  return (
    <li className="relative pl-4 pb-3 last:pb-0">
      <span className={cn("absolute left-0 top-1.5 size-2 rounded-full", level === "ESCALATION" ? "bg-sev-critical" : level === "SUPPORT" ? "bg-sev-moderate" : level === "PRIMARY" || level === "AGENCY" ? "bg-water" : "bg-muted-foreground")} aria-hidden />
      <span className="absolute left-1 top-4.5 bottom-0 w-px bg-border" aria-hidden />
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="micro-label text-[0.5rem]!">{level.toLowerCase()}</span>
        <span className="data-mono text-xs font-semibold text-foreground">{label}</span>
        {status && <span className="micro-label text-[0.46rem]! text-muted-foreground/70">{status.toLowerCase()}</span>}
        {source && <span className="micro-label text-[0.46rem]! text-muted-foreground/60">via {source.toLowerCase()}</span>}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{detail}</p>
      {asset && <p className="text-[0.65rem] text-muted-foreground/80 mt-0.5">asset: {asset}</p>}
    </li>
  );
}

function Readout({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-slate-50 px-3 py-2">
      <p className="micro-label text-[0.5rem]!">{label}</p>
      <p className={cn("data-mono text-sm mt-0.5", tone ?? "text-foreground")}>{value}</p>
    </div>
  );
}

function sevClass(s: string): string {
  return s === "CRITICAL" ? "text-sev-critical" : s === "HIGH" ? "text-sev-high" : s === "MODERATE" ? "text-sev-moderate" : "text-muted-foreground";
}

function hav(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

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
