"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PALETTE } from "@/lib/palette";

// Map legend: severity ramp, status symbols, layer keys. Floating panel
// over the dark ops basemap. Collapsible — starts collapsed on phones so it
// never covers the majority of the small map canvas.
export function MapLegend({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useUiLegend();
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsSmall(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Phones: default the legend collapsed so the 9-row card never buries the
  // small map canvas; users can expand it with a 44px-target button.
  useEffect(() => {
    if (isSmall) setOpen(false);
  }, [isSmall, setOpen]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute z-10 bottom-3 left-3 panel rounded-lg px-2.5 py-1.5 micro-label !text-[0.58rem] text-slate-600 hover:bg-ink-850 transition-colors touch-target"
        aria-expanded={false}
      >
        legend
      </button>
    );
  }
  return (
    <div className={cn("absolute z-10 bottom-3 left-3 panel rounded-xl p-3 max-w-48", compact && "text-[0.62rem]")}>
      {(compact || isSmall) && (
        <button onClick={() => setOpen(false)} className="absolute top-1.5 right-2 p-1 micro-label !text-[0.55rem] text-slate-500 hover:text-aqua" aria-label="Collapse legend">
          hide
        </button>
      )}
      <p className="micro-label !text-[0.55rem] text-slate-500 mb-2">legend</p>
      <ul className="space-y-1.5 text-[0.66rem] text-slate-400">
        <LegendRow color={PALETTE.sevCritical} label="severity 4 · critical" />
        <LegendRow color={PALETTE.sevHigh} label="severity 3 · high" />
        <LegendRow color={PALETTE.sevModerate} label="severity 2 · moderate" />
        <LegendRow color={PALETTE.textFaint} label="severity 1 · closed/low" />
        <LegendRow color={PALETTE.aquaMid} shape="line" label="drain / catchment" />
        <LegendRow color={PALETTE.aquaDim} shape="dot-lg" label="pump station" />
        <LegendRow color={PALETTE.sevModerate} shape="halo" label="ground-truth hotspot" />
        <LegendRow color={PALETTE.aqua} shape="glow" label="rainfall gauge (mm)" />
        <LegendRow color={PALETTE.aqua} shape="dot-lg" label="your location (Locate Me)" />
      </ul>
      <p className="mt-2.5 pt-2 hairline-t micro-label !text-[0.52rem] text-slate-400 leading-relaxed">
        marker size ∝ risk score · tap a marker for details
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
    <li className="flex items-center gap-2.5">
      {shape === "line" ? (
        <span aria-hidden className="w-4 h-[3px] rounded-full shrink-0" style={{ background: color }} />
      ) : shape === "halo" ? (
        <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0 grid place-items-center" style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }}>
          <span className="w-1 h-1 rounded-full" style={{ background: color }} />
        </span>
      ) : shape === "glow" ? (
        <span aria-hidden className="w-3 h-3 rounded-full shrink-0" style={{ background: `radial-gradient(circle, ${color}aa 0%, ${color}33 60%, transparent 75%)` }} />
      ) : shape === "dot-lg" ? (
        <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      ) : (
        <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/60" style={{ background: color }} />
      )}
      <span className="truncate">{label}</span>
    </li>
  );
}
