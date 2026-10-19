"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { AnimatedProgress } from "@/components/motion/kit";

// Domain display primitives: severity, status, risk, provenance, time.
// Monsoon ink: indigo surfaces, aqua signal, warm severity ramp.
// Colour is never the only signal (label text + symbols always present).

export const STATUS_ORDER = ["DETECTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "VERIFIED", "CLOSED", "REOPENED"] as const;

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  DETECTED: { label: "Detected", cls: "text-slate-600 bg-slate-100 border-slate-200", dot: "bg-slate-500" },
  TRIAGED: { label: "Triaged", cls: "text-amber-700 bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  ASSIGNED: { label: "Assigned", cls: "text-blue-700 bg-blue-50 border-blue-200", dot: "bg-blue-500" },
  IN_PROGRESS: { label: "In Field", cls: "text-water bg-blue-50 border-blue-200", dot: "bg-water-dim" },
  VERIFIED: { label: "Verified", cls: "text-emerald-700 bg-emerald-50 border-emerald-200", dot: "bg-verified" },
  CLOSED: { label: "Closed", cls: "text-slate-500 bg-slate-50 border-slate-200", dot: "bg-slate-400" },
  REOPENED: { label: "Reopened", cls: "text-red-700 bg-red-50 border-red-200", dot: "bg-sev-critical" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "text-slate-600 bg-slate-100 border-slate-200", dot: "bg-slate-400" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 micro-label !text-[0.6rem] !tracking-[0.08em] font-medium",
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
  LOW: { label: "Low", cls: "text-slate-600 bg-slate-100 border-slate-200", bar: "bg-slate-400" },
  MODERATE: { label: "Moderate", cls: "text-amber-700 bg-amber-50 border-amber-200", bar: "bg-amber-500" },
  HIGH: { label: "High", cls: "text-orange-700 bg-orange-50 border-orange-200", bar: "bg-orange-500" },
  CRITICAL: { label: "Critical", cls: "text-red-700 bg-red-50 border-red-200", bar: "bg-red-500" },
};

export function RiskBadge({ band, score, className }: { band: string; score?: number; className?: string }) {
  const m = RISK_META[band] ?? RISK_META.LOW;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 micro-label !text-[0.6rem] font-medium", m.cls, className)}>
      {score != null && <span className="data-mono !text-[0.65rem] !tracking-normal !normal-case">{score}</span>}
      {m.label}
    </span>
  );
}

export function RiskMeter({ score, band, className }: { score: number; band: string; className?: string }) {
  const m = RISK_META[band] ?? RISK_META.LOW;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <AnimatedProgress value={score} max={100} className="w-24" fillClassName={m.bar} />
      <span className="data-mono text-xs text-foreground">{score}</span>
    </div>
  );
}

export function SeverityTicks({ severity, className }: { severity: number; className?: string }) {
  const color = severity >= 4 ? "bg-red-500" : severity === 3 ? "bg-orange-500" : severity === 2 ? "bg-amber-500" : "bg-slate-500";
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} role="img" aria-label={`Severity ${severity} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("h-3 w-1 rounded-[2px]", i <= severity ? color : "bg-ink-800")} />
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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 micro-label !text-[0.6rem] !tracking-[0.08em]",
        low ? "text-amber-700 border-amber-200 bg-amber-50" : "text-slate-600 border-slate-200 bg-slate-50"
      )}
    >
      conf <span className="data-mono !text-[0.65rem] !tracking-normal !normal-case">{pct}%</span>
      {low && <span aria-hidden>⚠</span>}
    </span>
  );
}

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const meta: Record<string, { label: string; cls: string }> = {
    SYNTHETIC_DEMO: { label: "synthetic demo", cls: "text-amber-700 border-amber-200 bg-amber-50" },
    WEB_FORM: { label: "live submission", cls: "text-water border-blue-200 bg-blue-50" },
    FIELD_UI: { label: "field upload", cls: "text-emerald-700 border-emerald-200 bg-emerald-50" },
    MODEL_OUTPUT: { label: "model output", cls: "text-blue-700 border-blue-200 bg-blue-50" },
    ENGINE: { label: "engine", cls: "text-slate-600 border-slate-200 bg-slate-50" },
    MANUAL: { label: "manual", cls: "text-slate-600 border-slate-200 bg-slate-50" },
  };
  const m = meta[source] ?? { label: source.toLowerCase(), cls: "text-slate-600 border-slate-200 bg-slate-50" };
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 micro-label !text-[0.58rem]", m.cls, className)}>{m.label}</span>;
}

export function ProviderChip({ provider, model, className }: { provider: string; model?: string | null; className?: string }) {
  const isGlm = provider === "GLM";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 micro-label !text-[0.6rem]",
        isGlm ? "text-water border-blue-200 bg-blue-50" : "text-slate-600 border-slate-200 bg-slate-50",
        className
      )}
      title={model ?? undefined}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", isGlm ? "bg-water-dim" : "bg-slate-400")} />
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

export function Panel({ title, actions, children, className, bodyClassName, dense, icon }: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  dense?: boolean;
  icon?: ReactNode;
}) {
  return (
    <section className={cn("panel rounded-xl flex flex-col min-h-0", className)} aria-label={typeof title === "string" ? title : undefined}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 hairline-b px-4 py-3 shrink-0">
          <h2 className="flex items-center gap-2 text-[0.82rem] font-semibold text-slate-200 leading-none">
            {icon && <span className="text-aqua-dim [&>svg]:size-4" aria-hidden>{icon}</span>}
            {title}
          </h2>
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
      {icon && <div className="text-slate-500 [&>svg]:size-8" aria-hidden>{icon}</div>}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint && <p className="text-xs text-muted-foreground/80 max-w-sm">{hint}</p>}
      {action}
    </div>
  );
}

export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-lg shimmer" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </div>
  );
}

export function ErrorNote({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm", className)}
    >
      <span className="text-sev-critical" aria-hidden>⚠</span>
      <span className="text-red-500 flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="micro-label !text-[0.6rem] text-aqua hover:text-aqua-dim transition-colors">
          retry
        </button>
      )}
    </motion.div>
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
  return s === "CRITICAL" ? "text-sev-critical" : s === "HIGH" ? "text-sev-high" : s === "MODERATE" ? "text-sev-moderate" : "text-slate-500";
}
