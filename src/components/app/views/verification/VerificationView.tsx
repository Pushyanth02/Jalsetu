"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, ApiClientError, type EventSummary } from "@/lib/client/api";
import {
  ConfidenceChip, ErrorNote, LoadingRows, Panel, RiskBadge, SeverityTicks, SourceBadge, StatusBadge, TimeAgo, fmtDateTime, timeAgo,
} from "@/components/app/shared/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { navigate } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import { CountUp, HoverLift, PulseDot, Reveal, Shine, Stagger, StaggerItem } from "@/components/motion/kit";
import { Camera, Check, ChevronRight, ClipboardCheck, RefreshCw, RotateCcw, Search, X } from "lucide-react";

// FIELD VERIFICATION - workflow board. Events grouped by verification stage
// column; a dialog per event records the next stage (field team role) or
// reopens closed events (agency role). Stages are order-validated server-side
// and honest 409 errors are surfaced inline.

const VERIF_STAGES = ["ASSIGNED", "DISPATCHED", "OBSERVED", "EVIDENCE_UPLOADED", "ACTION_RECORDED", "VERIFIED", "CLOSED"] as const;

const COLUMNS: { key: string; title: string; hint: string; dot: string; statuses: string[] }[] = [
  { key: "unassigned", title: "Unassigned", hint: "Spotted or sorted, but no agency has been assigned yet", dot: "bg-slate-400", statuses: ["DETECTED", "TRIAGED"] },
  { key: "assigned", title: "Assigned", hint: "An agency is responsible; a crew has not set out yet", dot: "bg-blue-500", statuses: ["ASSIGNED"] },
  { key: "infield", title: "In Field", hint: "A crew is on site or on the way, observing or acting", dot: "bg-water", statuses: ["IN_PROGRESS"] },
  { key: "verified", title: "Verified / Closed", hint: "Checked on site with evidence, or closed", dot: "bg-verified", statuses: ["VERIFIED", "CLOSED"] },
  { key: "reopened", title: "Reopened", hint: "Flooded again after closing; back in the queue", dot: "bg-sev-high", statuses: ["REOPENED"] },
];

const RISK_FILTERS = ["ALL", "LOW", "MODERATE", "HIGH", "CRITICAL"] as const;

interface VerifyEventDetail {
  event: {
    id: string;
    code: string;
    title: string;
    category: string;
    status: string;
    severity: number;
    lat: number;
    lng: number;
    locationText: string;
    jurisdictionId: string | null;
    agencyCode: string | null;
    firstReportedAt: string;
    lastActivityAt: string;
    reportCount: number;
    recurrenceCount: number;
    riskScore: number;
    riskBand: string;
    riskAssessedAt: string | null;
    confidence: number;
    confidenceNote: string | null;
    classificationProvider: string | null;
    modelVersion: string | null;
    rainfall24hMm: number | null;
    rainfall72hMm: number | null;
    closedAt: string | null;
    reopenedAt: string | null;
    source: string;
    verifications: {
      id: string;
      stage: string;
      observedSeverity: string | null;
      waterDepthCm: number | null;
      notes: string | null;
      verifiedBy: string;
      verifiedAt: string;
    }[];
  };
}

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

export function VerificationView() {
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const eventsQ = useQuery({
    queryKey: ["events", "verify-board"],
    queryFn: () => apiGet<EventSummary[]>("/api/events?limit=200").then((r) => r.data),
    refetchInterval: 60_000,
  });

  const all = eventsQ.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (e) =>
        (riskFilter === "ALL" || e.riskBand === riskFilter) &&
        (q === "" ||
          e.code.toLowerCase().includes(q) ||
          e.title.toLowerCase().includes(q) ||
          e.locationText.toLowerCase().includes(q) ||
          (e.agencyCode ?? "").toLowerCase().includes(q))
    );
  }, [all, riskFilter, search]);

  const byStatus = useMemo(() => {
    const m = new Map<string, EventSummary[]>();
    for (const col of COLUMNS) m.set(col.key, []);
    for (const e of filtered) {
      const col = COLUMNS.find((c) => c.statuses.includes(e.status));
      if (col) m.get(col.key)?.push(e);
    }
    return m;
  }, [filtered]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* header: title + filters */}
      <div className="hairline-b bg-ink-900 px-4 sm:px-6 py-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-900 leading-tight">
              <span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-water shrink-0" aria-hidden>
                <ClipboardCheck className="size-4.5" />
              </span>
              Field Verification
            </h1>
            <p className="mt-1 text-xs text-muted-foreground sm:pl-[2.875rem]">
              Every incident moves through fixed steps in order: assigned → dispatched → observed → evidence → action → verified → closed. Open a card to record the next step.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" aria-hidden />
              <label htmlFor="verify-search" className="sr-only">
                Search events
              </label>
              <Input
                id="verify-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="code, title, area, agency"
                className="h-8 pl-8 w-44 sm:w-56 rounded-lg bg-ink-900 border-border text-xs"
                maxLength={60}
              />
            </div>
            <Label htmlFor="verify-risk" className="sr-only">
              Filter by risk band
            </Label>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger id="verify-risk" className="h-8 w-32 rounded-lg bg-ink-900 border-border text-xs" aria-label="Risk band filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_FILTERS.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {r === "ALL" ? "all risk bands" : r.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-border text-slate-600 hover:bg-ink-850"
              disabled={eventsQ.isFetching}
              onClick={() => eventsQ.refetch()}
              aria-label="Refresh events"
            >
              <RefreshCw className={cn("size-3.5", eventsQ.isFetching && "animate-spin")} aria-hidden />
            </Button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <SourceBadge source="SYNTHETIC_DEMO" />
          <span className="inline-flex items-center gap-1.5 micro-label !text-[0.5rem] text-muted-foreground/80" title="The board mixes seeded demo events with live submissions">
            <PulseDot color="bg-emerald-500" size={6} /> seeded demo + live events
          </span>
          <span className="data-mono text-[0.62rem] text-slate-500 ml-auto" aria-live="polite">
            <CountUp value={filtered.length} /> shown / {all.length} loaded
          </span>
        </div>
      </div>

      {/* board: 5 columns, stacked on mobile */}
      <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden p-3">
        {eventsQ.isLoading ? (
          <LoadingRows rows={6} />
        ) : eventsQ.isError ? (
          <div className="max-w-lg">
            <ErrorNote message={(eventsQ.error as Error).message} onRetry={() => eventsQ.refetch()} />
          </div>
        ) : all.length === 0 ? (
          <EmptyStateBoard />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 xl:h-full min-h-0 items-start xl:items-stretch">
            {COLUMNS.map((col) => {
              const items = byStatus.get(col.key) ?? [];
              return (
                <Panel
                  key={col.key}
                  title={
                    <span className="flex items-center gap-2" title={col.hint}>
                      <span className={cn("size-2 rounded-full", col.dot)} aria-hidden />
                      {col.title}
                      <span className="data-mono text-[0.68rem] text-slate-400">
                        <CountUp value={items.length} />
                      </span>
                    </span>
                  }
                  dense
                  className="overflow-hidden"
                  bodyClassName="p-2 flex flex-col gap-2 overflow-y-auto max-h-[46vh] xl:max-h-none xl:flex-1"
                >
                  {items.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[0.65rem] text-slate-400">{col.key === "unassigned" ? "nothing waiting for assignment" : "no events"}</p>
                  ) : (
                    <Stagger className="flex flex-col gap-2">
                      {items.map((e) => (
                        <StaggerItem key={e.id}>
                          <BoardCard event={e} onOpen={() => setOpenId(e.id)} />
                        </StaggerItem>
                      ))}
                    </Stagger>
                  )}
                </Panel>
              );
            })}
          </div>
        )}
      </div>

      <VerifyDialog eventId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function EmptyStateBoard() {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center py-10">
        <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-water mx-auto" aria-hidden>
          <ClipboardCheck className="size-6" />
        </span>
        <p className="mt-3 text-sm font-medium text-slate-600">No Events to Verify</p>
        <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
          Incidents appear here once the system groups citizen reports into events.
        </p>
      </div>
    </div>
  );
}

function BoardCard({ event, onOpen }: { event: EventSummary; onOpen: () => void }) {
  return (
    <HoverLift>
      <button
        onClick={onOpen}
        className="w-full text-left rounded-xl border border-border/80 bg-ink-900 px-3 py-2.5 shadow-xs transition-colors hover:border-aqua/50 group"
        aria-label={`${event.code}: ${event.title}. Risk ${event.riskBand.toLowerCase()}, ${event.reportCount} reports.`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="data-mono text-[0.68rem] font-semibold text-water">{event.code}</span>
          <StatusBadge status={event.status} />
          <RiskBadge band={event.riskBand} score={event.riskScore} />
          {event.recurrenceCount > 0 && (
            <span className="micro-label !text-[0.55rem] text-sev-high" title={`recurred ${event.recurrenceCount} times`}>
              ↻{event.recurrenceCount}
            </span>
          )}
          <TimeAgo iso={event.lastActivityAt} />
        </div>
        <p className="mt-1 text-[0.8rem] text-slate-700 leading-snug line-clamp-1">{event.title}</p>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          <SeverityTicks severity={event.severity} />
          <span className="data-mono text-[0.62rem] text-slate-500">{event.reportCount} rep</span>
          <span className="data-mono text-[0.62rem] text-slate-500">{event.agencyCode ?? "unassigned"}</span>
          <ChevronRight className="ml-auto size-3.5 text-slate-400 group-hover:text-water transition-colors" aria-hidden />
        </div>
      </button>
    </HoverLift>
  );
}

// --- event dialog --------------------------------------------------------------

function VerifyDialog({ eventId, onClose }: { eventId: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiGet<VerifyEventDetail>(`/api/events/${eventId}`).then((r) => r.data),
    enabled: !!eventId,
  });

  const ev = detailQ.data?.event ?? null;

  // form state
  const [stage, setStage] = useState<string>("DISPATCHED");
  const [observedSeverity, setObservedSeverity] = useState("MEDIUM");
  const [depth, setDepth] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // reset the form whenever a different event is opened
  useEffect(() => {
    if (eventId) {
      setObservedSeverity("MEDIUM");
      setDepth("");
      setNotes("");
      setPhoto(null);
      setPhotoErr(null);
      setReopenReason("");
      setFormError(null);
    }
  }, [eventId]);

  // preselect the next expected stage whenever the detail loads or verifications change
  useEffect(() => {
    if (!detailQ.data) return;
    const reached = new Set(detailQ.data.event.verifications.map((v) => v.stage));
    setStage(VERIF_STAGES.find((s) => !reached.has(s)) ?? "CLOSED");
  }, [detailQ.data?.event.id, detailQ.data?.event.verifications.length]);

  const reached = useMemo(() => new Set((ev?.verifications ?? []).map((v) => v.stage)), [ev]);
  const nextStage = VERIF_STAGES.find((s) => !reached.has(s));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event", eventId] });
    qc.invalidateQueries({ queryKey: ["events"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  };

  const verify = useMutation({
    mutationFn: (p: Record<string, unknown>) => apiPost(`/api/events/${eventId}/verify`, p, "FIELD_TEAM"),
    onSuccess: () => {
      invalidate();
      setFormError(null);
      setNotes("");
      setDepth("");
      setPhoto(null);
      toast({ title: "Verification stage recorded", description: `${stage.toLowerCase().replace(/_/g, " ")} logged for ${ev?.code ?? "event"}.` });
    },
    onError: (e) => {
      const msg = (e as ApiClientError).message;
      setFormError(msg);
      toast({ title: "Verification failed", description: msg, variant: "destructive" });
    },
  });

  const reopen = useMutation({
    mutationFn: (reason: string) => apiPut(`/api/events/${eventId}/verify`, { reopenReason: reason }, "AGENCY"),
    onSuccess: () => {
      invalidate();
      setReopenReason("");
      setFormError(null);
      toast({ title: "Event reopened", description: "Recurrence count incremented; the event is back in the queue." });
    },
    onError: (e) => {
      const msg = (e as ApiClientError).message;
      setFormError(msg);
      toast({ title: "Reopen failed", description: msg, variant: "destructive" });
    },
  });

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

  const submitStage = () => {
    setFormError(null);
    verify.mutate({
      stage,
      observedSeverity,
      waterDepthCm: depth ? Number(depth) : undefined,
      notes: notes.trim() || undefined,
      photoDataUrl: photo?.dataUrl,
      photoCaption: photo ? `Field verification: ${stage.toLowerCase().replace(/_/g, " ")}` : undefined,
    });
  };

  return (
    <Dialog open={!!eventId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl rounded-xl p-0 gap-0 overflow-hidden">
        <div className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader className="p-4 pb-0 pr-10">
            <DialogTitle className="data-mono !text-sm font-semibold text-water flex items-center gap-2 flex-wrap">
              {ev ? ev.code : eventId}
              {ev && <StatusBadge status={ev.status} />}
            </DialogTitle>
            <DialogDescription className="text-xs leading-snug line-clamp-2">
              {ev ? ev.title : "Loading event dossier"}
            </DialogDescription>
            {ev && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <RiskBadge band={ev.riskBand} score={ev.riskScore} />
                <ConfidenceChip confidence={ev.confidence} note={ev.confidenceNote} />
                <SourceBadge source={ev.source} />
              </div>
            )}
          </DialogHeader>

          <div className="p-4 space-y-4">
            {detailQ.isLoading ? (
              <LoadingRows rows={4} />
            ) : detailQ.isError ? (
              <ErrorNote message={(detailQ.error as Error).message} onRetry={() => detailQ.refetch()} />
            ) : ev ? (
              <>
                {/* summary */}
                <Reveal>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <Fact label="Severity" value={<SeverityTicks severity={ev.severity} />} />
                    <Fact label="Reports" value={<span className="data-mono">{ev.reportCount} ({ev.recurrenceCount} recurrences)</span>} />
                    <Fact label="Agency" value={<span className="data-mono">{ev.agencyCode ?? "unassigned"}</span>} />
                    <Fact label="Location" value={<span className="data-mono !text-[0.68rem]">{ev.lat.toFixed(4)}, {ev.lng.toFixed(4)}</span>} />
                    <Fact label="First Reported" value={<TimeAgo iso={ev.firstReportedAt} />} />
                    <Fact label="Last Activity" value={<TimeAgo iso={ev.lastActivityAt} />} />
                    <Fact label="Rainfall 24/72h" value={<span className="data-mono">{Math.round(ev.rainfall24hMm ?? 0)} / {Math.round(ev.rainfall72hMm ?? 0)} mm</span>} />
                    <Fact label="Classification" value={ev.classificationProvider ? <span className="micro-label !text-[0.55rem]">{ev.classificationProvider.toLowerCase()}</span> : <span className="text-slate-500">n/a</span>} />
                    <Fact label="Risk Assessed" value={ev.riskAssessedAt ? <TimeAgo iso={ev.riskAssessedAt} /> : <span className="text-slate-500">pending</span>} />
                  </dl>
                </Reveal>
                <p className="text-xs text-slate-500 -mt-2">{ev.locationText}</p>

                {/* stepper */}
                <Reveal delay={0.06}>
                  <div className="pt-3 hairline-t">
                    <p className="micro-label mb-2.5">Verification Progress</p>
                    <StageStepper stages={[...reached]} />
                  </div>
                </Reveal>

                {/* timeline */}
                <Reveal delay={0.12}>
                  <div className="pt-3 hairline-t">
                    <p className="micro-label mb-2.5">Recorded Stages</p>
                    {ev.verifications.length === 0 ? (
                      <p className="text-xs text-slate-500">No stages recorded yet. The first entry is typically dispatched once a team is on the way.</p>
                    ) : (
                      <ol>
                        {ev.verifications.map((v, i) => (
                          <li key={v.id} className="relative pl-4 pb-2.5 last:pb-0">
                            <span
                              className={cn("absolute left-0 top-1.5 size-2 rounded-full", v.stage === "VERIFIED" || v.stage === "CLOSED" ? "bg-verified" : "bg-water-dim")}
                              aria-hidden
                            />
                            {i < ev.verifications.length - 1 && <span className="absolute left-[3.5px] top-3.5 bottom-0 w-px bg-border" aria-hidden />}
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="micro-label !text-[0.52rem]">{v.stage.toLowerCase().replace(/_/g, " ")}</span>
                              <span className="text-[0.62rem] text-slate-500">
                                {v.verifiedBy.toLowerCase()} · {fmtDateTime(v.verifiedAt)}
                              </span>
                            </div>
                            {v.notes && <p className="mt-0.5 text-xs text-slate-600">{v.notes}</p>}
                            {(v.waterDepthCm != null || v.observedSeverity) && (
                              <p className="mt-0.5 data-mono text-[0.62rem] text-slate-500">
                                {v.waterDepthCm != null && <>depth {v.waterDepthCm}cm </>}
                                {v.observedSeverity && <>· observed {v.observedSeverity.toLowerCase()}</>}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </Reveal>

                {/* action area */}
                <Reveal delay={0.18}>
                  <div className="pt-3 hairline-t">
                    {ev.status === "CLOSED" ? (
                      <div className="space-y-2">
                        <p className="micro-label">Reopen Event · Agency Role</p>
                        <p className="text-xs text-slate-500">
                          Closed {ev.closedAt ? timeAgo(ev.closedAt) : ""}. New citizen reports from the same spot reopen it automatically; agencies can also reopen it manually with a reason.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                          <div className="flex-1 space-y-1">
                            <Label htmlFor="reopen-reason" className="text-[0.65rem] sr-only">
                              Reopen reason
                            </Label>
                            <Textarea
                              id="reopen-reason"
                              value={reopenReason}
                              onChange={(e) => setReopenReason(e.target.value)}
                              placeholder="manual reopen reason, e.g. re-flooding reported via hotline"
                              rows={2}
                              className="rounded-lg bg-ink-900 border-border text-xs"
                              maxLength={400}
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg border-red-200 bg-red-50 text-sev-critical hover:bg-red-100 hover:text-sev-critical h-9 shrink-0"
                            disabled={reopenReason.trim().length < 4 || reopen.isPending}
                            onClick={() => reopen.mutate(reopenReason.trim())}
                          >
                            <RotateCcw className="size-3.5" aria-hidden />
                            {reopen.isPending ? "Reopening…" : "Reopen"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <p className="micro-label">Record Verification Stage · Field Team Role</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          <div className="space-y-1">
                            <Label className="text-[0.65rem]">Stage</Label>
                            <Select value={stage} onValueChange={setStage}>
                              <SelectTrigger className="h-8 rounded-lg bg-ink-900 border-border text-xs" aria-label="Verification stage">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VERIF_STAGES.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {s.toLowerCase().replace(/_/g, " ")}
                                    {reached.has(s) ? " · recorded" : s === nextStage ? " · next" : ""}
                                    {s === "CLOSED" ? " (closes event)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[0.65rem]">Observed Severity</Label>
                            <Select value={observedSeverity} onValueChange={setObservedSeverity}>
                              <SelectTrigger className="h-8 rounded-lg bg-ink-900 border-border text-xs" aria-label="Observed severity">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {s.toLowerCase()}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="vf-depth" className="text-[0.65rem]">
                              Water depth (cm)
                            </Label>
                            <Input
                              id="vf-depth"
                              inputMode="numeric"
                              value={depth}
                              onChange={(e) => setDepth(e.target.value.replace(/\D/g, ""))}
                              placeholder="e.g. 35"
                              className="h-8 rounded-lg bg-ink-900 border-border data-mono text-xs"
                              maxLength={3}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="vf-notes" className="text-[0.65rem]">
                            Field notes (optional)
                          </Label>
                          <Textarea
                            id="vf-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="what the team observed on site"
                            className="rounded-lg bg-ink-900 border-border text-xs"
                            maxLength={600}
                          />
                        </div>

                        <div>
                          <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            id="vf-photo"
                            onChange={(e) => e.target.files?.[0] && onPhotoFile(e.target.files[0])}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-lg border-border text-slate-600 hover:bg-ink-850 h-8"
                              disabled={photoBusy || verify.isPending}
                              onClick={() => fileRef.current?.click()}
                            >
                              <Camera className="size-3.5" aria-hidden /> {photoBusy ? "Processing…" : photo ? "Replace photo" : "Attach photo"}
                            </Button>
                            {photo && (
                              <Button type="button" variant="ghost" size="sm" className="h-7 text-[0.65rem] text-slate-500" onClick={() => setPhoto(null)}>
                                <X className="size-3" aria-hidden /> Remove
                              </Button>
                            )}
                            <span className="text-[0.62rem] text-slate-500">Optional. Downscaled to at most 1024px jpeg.</span>
                          </div>
                          {photoErr && (
                            <p className="mt-1.5 text-[0.62rem] text-sev-high" role="alert">
                              {photoErr}
                            </p>
                          )}
                          {photo && (
                            <figure className="mt-2 flex items-center gap-3 rounded-xl border border-border/70 bg-ink-900 p-2.5 shadow-xs ring-1 ring-hairline max-w-xs">
                              <div className="relative rounded-lg overflow-hidden border border-border/60 size-16 shrink-0 bg-slate-100">
                                <img src={photo.dataUrl} alt="Field photo preview" className="size-full object-cover" />
                              </div>
                              <figcaption className="min-w-0 text-[0.62rem] text-slate-500">
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 text-verified px-2 py-0.5 micro-label !text-[0.52rem]">uploaded</span>
                                <span className="block mt-1 truncate">{photo.name}</span>
                              </figcaption>
                            </figure>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-[0.62rem] text-slate-500">
                            Next expected: <span className="text-water">{(nextStage ?? "CLOSED").toLowerCase().replace(/_/g, " ")}</span>. Steps must be recorded in order (checked by the server).
                          </p>
                          <Button size="sm" className="group relative overflow-hidden rounded-lg bg-aqua text-ink-950 hover:bg-aqua-dim h-8" disabled={verify.isPending} onClick={submitStage}>
                            {verify.isPending ? "Recording…" : "Record stage"}
                            <Shine />
                          </Button>
                        </div>
                      </div>
                    )}

                    {formError && <ErrorNote className="mt-3" message={formError} />}

                    <div className="mt-4 pt-3 hairline-t flex items-center justify-between gap-2">
                      <span className="micro-label !text-[0.5rem] text-muted-foreground/70">mutations post as FIELD_TEAM / AGENCY demo roles</span>
                      <Button variant="outline" size="sm" className="rounded-lg border-border text-slate-600 hover:bg-ink-850 h-7 text-[0.65rem]" onClick={() => ev && navigate("event", ev.code)}>
                        Full dossier
                      </Button>
                    </div>
                  </div>
                </Reveal>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="micro-label !text-[0.5rem]">{label}</dt>
      <dd className="flex items-center min-w-0 text-slate-700">{value}</dd>
    </div>
  );
}

function StageStepper({ stages }: { stages: string[] }) {
  const reached = new Set(stages);
  const currentIdx = VERIF_STAGES.findIndex((s) => !reached.has(s));
  return (
    <ol className="flex items-center gap-0 overflow-x-auto no-scrollbar pb-1" aria-label="Verification progress">
      {VERIF_STAGES.map((s, i) => {
        const done = reached.has(s);
        const current = i === currentIdx;
        return (
          <li key={s} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1 w-14 sm:w-16">
              <span
                className={cn("size-4 rounded-full border-2 grid place-items-center transition-colors", done ? "bg-verified border-verified" : current ? "border-water" : "border-border")}
                aria-hidden
              >
                {done && <Check className="size-2.5 text-ink-950" aria-hidden />}
              </span>
              <span className={cn("micro-label !text-[0.44rem] text-center leading-tight", done ? "text-verified" : current ? "text-water" : "text-slate-400")}>
                {s.toLowerCase().replace(/_/g, " ")}
              </span>
            </div>
            {i < VERIF_STAGES.length - 1 && <span className={cn("h-[2px] w-3 sm:w-5", done ? "bg-verified/60" : "bg-border")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
