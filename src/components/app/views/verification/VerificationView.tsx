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
import { Camera, ClipboardList, RefreshCw, RotateCcw, Search, X } from "lucide-react";

// FIELD VERIFICATION - workflow board. Events grouped by verification stage
// column; a dialog per event records the next stage (field team role) or
// reopens closed events (agency role). Stages are order-validated server-side
// and honest 409 errors are surfaced inline.

const VERIF_STAGES = ["ASSIGNED", "DISPATCHED", "OBSERVED", "EVIDENCE_UPLOADED", "ACTION_RECORDED", "VERIFIED", "CLOSED"] as const;

const COLUMNS: { key: string; title: string; hint: string; statuses: string[] }[] = [
  { key: "unassigned", title: "unassigned", hint: "detected or triaged, not yet assigned to an agency", statuses: ["DETECTED", "TRIAGED"] },
  { key: "assigned", title: "assigned", hint: "responsibility assigned, dispatch pending", statuses: ["ASSIGNED"] },
  { key: "infield", title: "in field", hint: "dispatched, observation or action underway", statuses: ["IN_PROGRESS"] },
  { key: "verified", title: "verified / closed", hint: "field-verified with evidence, or closed", statuses: ["VERIFIED", "CLOSED"] },
  { key: "reopened", title: "reopened", hint: "recurrence after closure, back in the queue", statuses: ["REOPENED"] },
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
      <div className="hairline-b bg-ink-900/30 px-4 sm:px-6 py-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-medium flex items-center gap-2">
              <ClipboardList className="size-4 text-water" aria-hidden />
              Field Verification
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Workflow board. Stages advance in order: assigned, dispatched, observed, evidence, action, verified, closed.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" aria-hidden />
              <label htmlFor="verify-search" className="sr-only">
                Search events
              </label>
              <Input
                id="verify-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="code, title, area, agency"
                className="h-8 pl-8 w-44 sm:w-56 bg-ink-900 border-border text-xs"
                maxLength={60}
              />
            </div>
            <Label htmlFor="verify-risk" className="sr-only">
              Filter by risk band
            </Label>
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger id="verify-risk" className="h-8 w-32 bg-ink-900 border-border text-xs" aria-label="Risk band filter">
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
              className="h-8 border-border"
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
          <span className="micro-label !text-[0.5rem] text-muted-foreground/60" title="The board mixes seeded demo events with live submissions">
            seeded demo + live events
          </span>
          <span className="data-mono text-[0.62rem] text-muted-foreground ml-auto" aria-live="polite">
            {filtered.length} shown / {all.length} loaded
          </span>
        </div>
      </div>

      {/* board */}
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
          <div className="flex flex-col xl:flex-row gap-3 xl:h-full min-h-0">
            {COLUMNS.map((col) => {
              const items = byStatus.get(col.key) ?? [];
              return (
                <Panel
                  key={col.key}
                  title={
                    <span className="flex items-center gap-1.5" title={col.hint}>
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          col.key === "unassigned" ? "bg-slate-400" : col.key === "assigned" ? "bg-sky-300" : col.key === "infield" ? "bg-water" : col.key === "verified" ? "bg-verified" : "bg-sev-high"
                        )}
                        aria-hidden
                      />
                      {col.title}
                      <span className="data-mono ml-1 !text-[0.62rem] !tracking-normal !normal-case text-muted-foreground">{items.length}</span>
                    </span>
                  }
                  dense
                  className="w-full xl:flex-1 xl:min-w-[200px] min-h-0 overflow-hidden"
                  bodyClassName="overflow-y-auto max-h-[46vh] xl:max-h-none xl:flex-1"
                >
                  {items.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[0.65rem] text-muted-foreground/60">{col.key === "unassigned" ? "nothing waiting for assignment" : "no events"}</p>
                  ) : (
                    <ul>
                      {items.map((e) => (
                        <BoardCard key={e.id} event={e} onOpen={() => setOpenId(e.id)} />
                      ))}
                    </ul>
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
        <ClipboardList className="size-8 text-muted-foreground/50 mx-auto" aria-hidden />
        <p className="mt-2 text-sm text-muted-foreground">No events to verify</p>
        <p className="mt-1 text-xs text-muted-foreground/70 max-w-sm mx-auto">
          Events appear here once the ingest pipeline creates them from citizen reports.
        </p>
      </div>
    </div>
  );
}

function BoardCard({ event, onOpen }: { event: EventSummary; onOpen: () => void }) {
  return (
    <li className="hairline-b last:border-0">
      <button
        onClick={onOpen}
        className="w-full text-left px-3 py-2.5 hover:bg-ink-850/50 transition-colors group focus:bg-ink-850/70"
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
        <p className="mt-1 text-[0.8rem] text-foreground/90 leading-snug line-clamp-1">{event.title}</p>
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          <SeverityTicks severity={event.severity} />
          <span className="data-mono text-[0.62rem] text-muted-foreground">{event.reportCount} rep</span>
          <span className="data-mono text-[0.62rem] text-muted-foreground">{event.agencyCode ?? "unassigned"}</span>
          <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity micro-label !text-[0.5rem] text-water">open →</span>
        </div>
      </button>
    </li>
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
      <DialogContent className="sm:max-w-2xl rounded-md p-0 gap-0 overflow-hidden">
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
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs rounded-sm border border-border/70 bg-ink-850/30 p-3">
                  <Fact label="severity" value={<SeverityTicks severity={ev.severity} />} />
                  <Fact label="reports" value={<span className="data-mono">{ev.reportCount} ({ev.recurrenceCount} recurrences)</span>} />
                  <Fact label="agency" value={<span className="data-mono">{ev.agencyCode ?? "unassigned"}</span>} />
                  <Fact label="location" value={<span className="data-mono !text-[0.68rem]">{ev.lat.toFixed(4)}, {ev.lng.toFixed(4)}</span>} />
                  <Fact label="first reported" value={<TimeAgo iso={ev.firstReportedAt} />} />
                  <Fact label="last activity" value={<TimeAgo iso={ev.lastActivityAt} />} />
                  <Fact label="rainfall 24/72h" value={<span className="data-mono">{Math.round(ev.rainfall24hMm ?? 0)} / {Math.round(ev.rainfall72hMm ?? 0)} mm</span>} />
                  <Fact label="classification" value={ev.classificationProvider ? <span className="micro-label !text-[0.55rem]">{ev.classificationProvider.toLowerCase()}</span> : <span className="text-muted-foreground">n/a</span>} />
                  <Fact label="risk assessed" value={ev.riskAssessedAt ? <TimeAgo iso={ev.riskAssessedAt} /> : <span className="text-muted-foreground">pending</span>} />
                </dl>
                <p className="text-xs text-muted-foreground -mt-2">{ev.locationText}</p>

                {/* stepper */}
                <div className="pt-3 hairline-t">
                  <p className="micro-label mb-2">verification progress</p>
                  <StageStepper stages={[...reached]} />
                </div>

                {/* timeline */}
                <div className="pt-3 hairline-t">
                  <p className="micro-label mb-2">recorded stages</p>
                  {ev.verifications.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No stages recorded yet. The first entry is typically dispatched once a team is on the way.</p>
                  ) : (
                    <ol>
                      {ev.verifications.map((v, i) => (
                        <li key={v.id} className="relative pl-4 pb-2.5 last:pb-0">
                          <span
                            className={cn("absolute left-0 top-1.5 size-2 rounded-full", v.stage === "VERIFIED" || v.stage === "CLOSED" ? "bg-verified" : "bg-water/80")}
                            aria-hidden
                          />
                          {i < ev.verifications.length - 1 && <span className="absolute left-[3.5px] top-3.5 bottom-0 w-px bg-border" aria-hidden />}
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="micro-label !text-[0.52rem]">{v.stage.toLowerCase().replace(/_/g, " ")}</span>
                            <span className="text-[0.62rem] text-muted-foreground">
                              {v.verifiedBy.toLowerCase()} · {fmtDateTime(v.verifiedAt)}
                            </span>
                          </div>
                          {v.notes && <p className="mt-0.5 text-xs text-foreground/80">{v.notes}</p>}
                          {(v.waterDepthCm != null || v.observedSeverity) && (
                            <p className="mt-0.5 data-mono text-[0.62rem] text-muted-foreground">
                              {v.waterDepthCm != null && <>depth {v.waterDepthCm}cm </>}
                              {v.observedSeverity && <>· observed {v.observedSeverity.toLowerCase()}</>}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* action area */}
                <div className="pt-3 hairline-t">
                  {ev.status === "CLOSED" ? (
                    <div className="space-y-2">
                      <p className="micro-label">reopen event · agency role</p>
                      <p className="text-xs text-muted-foreground">
                        Closed {ev.closedAt ? timeAgo(ev.closedAt) : ""}. New citizen reports at this location auto-reopen it via recurrence; agencies can reopen manually with a reason.
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
                            className="bg-ink-900 border-border text-xs"
                            maxLength={400}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-sev-high/40 text-sev-high hover:bg-sev-high/10 h-9 shrink-0"
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
                      <p className="micro-label">record verification stage · field team role</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-[0.65rem]">Stage</Label>
                          <Select value={stage} onValueChange={setStage}>
                            <SelectTrigger className="h-8 bg-ink-900 border-border text-xs" aria-label="Verification stage">
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
                          <Label className="text-[0.65rem]">Observed severity</Label>
                          <Select value={observedSeverity} onValueChange={setObservedSeverity}>
                            <SelectTrigger className="h-8 bg-ink-900 border-border text-xs" aria-label="Observed severity">
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
                            className="h-8 bg-ink-900 border-border data-mono text-xs"
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
                          className="bg-ink-900 border-border text-xs"
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
                            className="border-border h-8"
                            disabled={photoBusy || verify.isPending}
                            onClick={() => fileRef.current?.click()}
                          >
                            <Camera className="size-3.5" aria-hidden /> {photoBusy ? "Processing…" : photo ? "Replace photo" : "Attach photo"}
                          </Button>
                          {photo && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-[0.65rem] text-muted-foreground" onClick={() => setPhoto(null)}>
                              <X className="size-3" aria-hidden /> Remove
                            </Button>
                          )}
                          <span className="text-[0.62rem] text-muted-foreground">Optional. Downscaled to at most 1024px jpeg.</span>
                        </div>
                        {photoErr && (
                          <p className="mt-1.5 text-[0.62rem] text-sev-high" role="alert">
                            {photoErr}
                          </p>
                        )}
                        {photo && (
                          <figure className="mt-2 flex items-center gap-3 rounded-sm border border-border/70 bg-ink-850/30 p-2 max-w-xs">
                            <div className="relative rounded-sm overflow-hidden border border-border/60 size-16 shrink-0 bg-ink-850">
                              { }
                              <img src={photo.dataUrl} alt="Field photo preview" className="size-full object-cover" />
                            </div>
                            <figcaption className="min-w-0 text-[0.62rem] text-muted-foreground">
                              <span className="inline-flex rounded-sm border border-verified/30 bg-verified/8 text-verified px-1.5 py-0.5 micro-label !text-[0.52rem]">uploaded</span>
                              <span className="block mt-1 truncate">{photo.name}</span>
                            </figcaption>
                          </figure>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-[0.62rem] text-muted-foreground">
                          Next expected: <span className="text-water">{(nextStage ?? "CLOSED").toLowerCase().replace(/_/g, " ")}</span>. Stages are validated in order by the server.
                        </p>
                        <Button size="sm" className="bg-water text-ink-950 hover:bg-water/85 h-8" disabled={verify.isPending} onClick={submitStage}>
                          {verify.isPending ? "Recording…" : "Record stage"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {formError && <ErrorNote className="mt-3" message={formError} />}

                  <div className="mt-4 pt-3 hairline-t flex items-center justify-between gap-2">
                    <span className="micro-label !text-[0.5rem] text-muted-foreground/60">mutations post as FIELD_TEAM / AGENCY demo roles</span>
                    <Button variant="outline" size="sm" className="border-border h-7 text-[0.65rem]" onClick={() => ev && navigate("event", ev.code)}>
                      Full dossier
                    </Button>
                  </div>
                </div>
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
      <dd className="flex items-center min-w-0 text-foreground/90">{value}</dd>
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
                {done && <span className="size-1.5 rounded-full bg-ink-950" />}
              </span>
              <span className={cn("micro-label !text-[0.44rem] text-center leading-tight", done ? "text-verified/90" : current ? "text-water" : "text-muted-foreground/60")}>
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
