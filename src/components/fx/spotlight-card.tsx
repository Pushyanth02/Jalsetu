"use client";

/**
 * Pointer-tracking spotlight card — a soft aqua halo follows the cursor
 * across the surface while a gradient edge lights up.
 * Adapted from MagicUI MagicCard (https://github.com/magicuidesign/magicui), MIT License.
 * Uses direct style mutation (no re-render) and is inert on touch devices.
 * The gradient border is painted via a two-layer background technique; the
 * caller keeps its own bg/border for the no-JS / no-hover case.
 */

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  /** Radial halo color (rgba) */
  spotlightColor?: string;
  /** Border gradient edge colors */
  edgeFrom?: string;
  edgeTo?: string;
  /** Halo radius in px */
  size?: number;
}

export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(45, 212, 191, 0.13)",
  edgeFrom = "rgba(45, 212, 191, 0.55)",
  edgeTo = "rgba(20, 184, 138, 0.18)",
  size = 260,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      haloRef.current?.style.setProperty(
        "background",
        `radial-gradient(${size}px circle at ${x}px ${y}px, ${spotlightColor}, transparent 72%)`
      );
      edgeRef.current?.style.setProperty(
        "background",
        `radial-gradient(${Math.max(size * 0.7, 140)}px circle at ${x}px ${y}px, ${edgeFrom}, ${edgeTo} 55%, transparent 80%)`
      );
    },
    [size, spotlightColor, edgeFrom, edgeTo]
  );

  const onLeave = useCallback(() => {
    haloRef.current?.style.setProperty("background", "none");
    edgeRef.current?.style.setProperty("background", "none");
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn("group relative isolate", className)}
    >
      {/* Border layer — clipped to a 1px ring, lights up on hover */}
      <div
        ref={edgeRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          padding: 1,
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
        }}
      />
      {/* Surface halo */}
      <div
        ref={haloRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
