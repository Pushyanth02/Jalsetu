"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Domain display primitives: severity, status, risk, provenance, time.
// Colour is never the only signal (label text + symbols always present).

export const STATUS_ORDER = ["DETECTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "VERIFIED", "CLOSED", "REOPENED"] as const;

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  DETECTED: { label: "Detected", cls: "text-slate-300 bg-slate-400/10 border-slate-400/25", dot: "bg-slate-400" },
  TRIAGED: { label: "Triaged", cls: "text-sev-moderate bg-sev-moderate/10 border-sev-moderate/30", dot: "bg-sev-moderate" },
  ASSIGNED: { label: "Assigned", cls: "text-sky-200 bg-sky-300/10 border-sky-300/25", dot: "bg-sky-300" },
  IN_PROGRESS: { label: "In field", cls: "text-water bg-water/10 border-water/30", dot: "bg-water" },
  VERIFIED: { label: "Verified", cls: "text-verified bg-verified/10 border-verified/30", dot: "bg-verified" },
  CLOSED: { label: "Closed", cls: "text-slate-400 bg-slate-400/8 border-slate-400/20", dot: "bg-slate-500" },
  REOPENED: { label: "Reopened", cls: "text-sev-high bg-sev-high/10 border-sev-high/30", dot: "bg-sev-high" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "text-slate-300 bg-slate-400/10 border-slate-400/25", dot: "bg-slate-400" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 micro-label !text-[0.6rem] !tracking-[0.1em] font-medium",
        m.cls,
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export const RISK_META: Record<string, { label: string; cls: string; bar: string }> = {
  LOW: { label: "Low", cls: "text-slate-300 border-slate-400/25 bg-slate-400/8", bar: "bg-slate-400" },
  MODERATE: { label: "Moderate", cls: "text-sev-moderate border-sev-moderate/30 bg-sev-moderate/10", bar: "bg-sev-moderate" },
  HIGH: { label: "High", cls: "text-sev-high border-sev-high/30 bg-sev-high/10", bar: "bg-sev-high" },
  CRITICAL: { label: "Critical", cls: "text-sev-critical border-sev-critical/35 bg-sev-critical/12", bar: "bg-sev-critical" },
};

export function RiskBadge({ band, score, className }: { band: string; score?: number; className?: string }) {
  const m = RISK_META[band] ?? RISK_META.LOW;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 micro-label !text-[0.6rem] font-medium", m.cls, className)}>
      {score != null && <span className="data-mono !text-[0.65rem] !tracking-normal !normal-case">{score}</span>}
      {m.label}
    </span>
  );
}

export function RiskMeter({ score, band, className }: { score: number; band: string; className?: string }) {
  const m = RISK_META[band] ?? RISK_META.LOW;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-24 rounded-full bg-ink-800 overflow-hidden" role="img" aria-label={`Risk ${score} of 100, ${band.toLowerCase()}`}>
        <div className={cn("h-full rounded-full transition-[width] duration-500", m.bar)} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="data-mono text-xs text-foreground">{score}</span>
    </div>
  );
}

export function SeverityTicks({ severity, className }: { severity: number; className?: string }) {
  const color = severity >= 4 ? "bg-sev-critical" : severity === 3 ? "bg-sev-high" : severity === 2 ? "bg-sev-moderate" : "bg-slate-400";
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} role="img" aria-label={`Severity ${severity} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("h-3 w-1 rounded-[1px]", i <= severity ? color : "bg-ink-800")} />
      ))}
    </span>
  );
}

export function ConfidenceChip({ confidence, note }: { confidence: number; note?: string | null }) {
  const pct = Math.round(confidence * 100);
  const low = confidence < 0.5;
  return (
    <span
      title={note ?? undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 micro-label !text-[0.6rem] !tracking-[0.08em]",
        low ? "text-sev-moderate border-sev-moderate/35 bg-sev-moderate/10" : "text-slate-300 border-slate-400/25 bg-slate-400/8"
      )}
    >
      conf <span className="data-mono !text-[0.65rem] !tracking-normal !normal-case">{pct}%</span>
      {low && <span aria-hidden>⚠</span>}
    </span>
  );
}

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const meta: Record<string, { label: string; cls: string }> = {
    SYNTHETIC_DEMO: { label: "synthetic demo", cls: "text-sev-moderate/90 border-sev-moderate/25 bg-sev-moderate/6" },
    WEB_FORM: { label: "live submission", cls: "text-water border-water/30 bg-water/8" },
    FIELD_UI: { label: "field upload", cls: "text-verified border-verified/30 bg-verified/8" },
    MODEL_OUTPUT: { label: "model output", cls: "text-sky-200 border-sky-300/25 bg-sky-300/8" },
    ENGINE: { label: "engine", cls: "text-slate-300 border-slate-400/25 bg-slate-400/8" },
    MANUAL: { label: "manual", cls: "text-slate-300 border-slate-400/25 bg-slate-400/8" },
  };
  const m = meta[source] ?? { label: source.toLowerCase(), cls: "text-slate-300 border-slate-400/25 bg-slate-400/8" };
  return (
    <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 micro-label !text-[0.58rem]", m.cls, className)}>{m.label}</span>
  );
}

export function ProviderChip({ provider, model, className }: { provider: string; model?: string | null; className?: string }) {
  const isGlm = provider === "GLM";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 micro-label !text-[0.6rem]",
        isGlm ? "text-water border-water/30 bg-water/8" : "text-slate-300 border-slate-400/25 bg-slate-400/8",
        className
      )}
      title={model ?? undefined}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", isGlm ? "bg-water" : "bg-slate-400")} />
      {provider === "GLM" ? "GLM" : provider === "MOCK" ? "deterministic" : provider.toLowerCase()}
      {model && <span className="data-mono !text-[0.56rem] text-muted-foreground !tracking-normal !normal-case max-w-44 truncate">{model.split("/")[0]}</span>}
    </span>
  );
}

export function AgencyTag({ code, name, className }: { code: string; name?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 text-sm", className)}>
      <span className="data-mono text-xs font-semibold text-water">{code}</span>
      {name && <span className="text-xs text-muted-foreground">{name}</span>}
    </span>
  );
}

// --- layout primitives ----------------------------------------------------------

export function Panel({ title, actions, children, className, bodyClassName, dense }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  dense?: boolean;
}) {
  return (
    <section className={cn("panel rounded-md flex flex-col min-h-0", className)} aria-label={typeof title === "string" ? title : undefined}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 hairline-b px-4 py-2.5 shrink-0">
          <h2 className="micro-label !text-[0.62rem] text-muted-foreground">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", dense ? "p-0" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 px-6 text-center min-h-40">
      {icon && <div className="text-muted-foreground/50" aria-hidden>{icon}</div>}
      <p className="text-sm text-muted-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground/70 max-w-sm">{hint}</p>}
      {action}
    </div>
  );
}

export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded-sm bg-ink-850 animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}

export function ErrorNote({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex items-center gap-3 rounded-sm border border-sev-critical/30 bg-sev-critical/8 px-3 py-2 text-sm", className)}>
      <span className="text-sev-critical" aria-hidden>⚠</span>
      <span className="text-sev-critical/90 flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="micro-label !text-[0.6rem] text-water hover:text-foreground transition-colors">
          retry
        </button>
      )}
    </div>
  );
}

// --- time ------------------------------------------------------------------------

export function timeAgo(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function TimeAgo({ iso, title = true }: { iso: string; title?: boolean }) {
  return (
    <time dateTime={iso} title={title ? fmtDateTime(iso) : undefined} className="data-mono text-[0.68rem] text-muted-foreground whitespace-nowrap">
      {timeAgo(iso)}
    </time>
  );
}

export const SEV_ORDER = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;
export function severityColor(s: string): string {
  return s === "CRITICAL" ? "text-sev-critical" : s === "HIGH" ? "text-sev-high" : s === "MODERATE" ? "text-sev-moderate" : "text-slate-300";
}
