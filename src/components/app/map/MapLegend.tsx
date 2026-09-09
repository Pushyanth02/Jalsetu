"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Map legend: severity ramp, status symbols, layer keys. Collapsible.
export function MapLegend({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useUiLegend();
  if (compact && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute z-10 top-2.5 left-2.5 panel rounded-sm px-2 py-1 micro-label !text-[0.58rem] hover:bg-ink-850"
        aria-expanded={false}
      >
        legend
      </button>
    );
  }
  return (
    <div className={cn("absolute z-10 top-2.5 left-2.5 panel rounded-md p-2.5 max-w-44", compact && "text-[0.6rem]")}>
      {compact && (
        <button onClick={() => setOpen(false)} className="absolute top-1 right-1.5 micro-label !text-[0.55rem] text-muted-foreground" aria-label="Collapse legend">
          hide
        </button>
      )}
      <p className="micro-label !text-[0.55rem] text-muted-foreground/70 mb-1.5">legend</p>
      <ul className="space-y-1.5 text-[0.66rem] text-muted-foreground">
        <LegendRow color="#e54848" label="severity 4 · critical" />
        <LegendRow color="#e8823c" label="severity 3 · high" />
        <LegendRow color="#d9a62e" label="severity 2 · moderate" />
        <LegendRow color="#64748b" label="severity 1 · closed/low" />
        <LegendRow color="#45c4b0" shape="line" label="drain / catchment" />
        <LegendRow color="#7fb8c9" shape="dot-lg" label="pump station" />
        <LegendRow color="#d9a62e" shape="halo" label="ground-truth hotspot" />
        <LegendRow color="#45c4b0" shape="glow" label="rainfall gauge (mm)" />
      </ul>
      <p className="mt-2 pt-1.5 hairline-t micro-label !text-[0.52rem] text-muted-foreground/60 leading-relaxed">
        marker size ∝ risk score
      </p>
    </div>
  );
}

function useUiLegend(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(true);
  return [open, setOpen];
}

function LegendRow({ color, label, shape }: { color: string; label: string; shape?: "line" | "dot-lg" | "halo" | "glow" }) {
  return (
    <li className="flex items-center gap-2">
      {shape === "line" ? (
        <span aria-hidden className="w-4 h-[3px] rounded-full shrink-0" style={{ background: color }} />
      ) : shape === "halo" ? (
        <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0 grid place-items-center" style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }}>
          <span className="w-1 h-1 rounded-full" style={{ background: color }} />
        </span>
      ) : shape === "glow" ? (
        <span aria-hidden className="w-3 h-3 rounded-full shrink-0" style={{ background: `radial-gradient(circle, ${color}88 0%, ${color}22 60%, transparent 75%)` }} />
      ) : shape === "dot-lg" ? (
        <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      ) : (
        <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0 border border-ink-950" style={{ background: color }} />
      )}
      <span className="truncate">{label}</span>
    </li>
  );
}
