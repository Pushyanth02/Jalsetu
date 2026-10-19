"use client";

/**
 * Falling light streaks — a quiet nod to monsoon rain seen from orbit.
 * Adapted from MagicUI Meteors (https://github.com/magicuidesign/magicui), MIT License.
 * Randomised once per mount (client-only views) so hydration stays deterministic.
 * Pure CSS animation — frozen by the global reduced-motion rule. Decorative only.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";

interface MeteorsProps {
  number?: number;
  className?: string;
}

export function Meteors({ number = 5, className }: MeteorsProps) {
  // All JalSetu views are client-only (dynamic, ssr: false), so the browser
  // is guaranteed here; the guard keeps the component SSR-safe regardless.
  // Randomised once per mount in the state initialiser — no effect, no
  // cascading render, and deterministic between server/client by contract.
  const [styles] = useState<Array<React.CSSProperties>>(() => {
    if (typeof window === "undefined") return [];
    return Array.from({ length: number }, () => ({
      "--angle": "-215deg",
      top: "-6%",
      left: `calc(0% + ${Math.floor(Math.random() * window.innerWidth)}px)`,
      animationDelay: `${(Math.random() * 4 + 0.4).toFixed(2)}s`,
      animationDuration: `${(Math.random() * 6 + 6).toFixed(2)}s`,
    }));
  });

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {styles.map((style, idx) => (
        <span
          key={idx}
          style={style}
          className="animate-meteor absolute size-0.5 rotate-(--angle) rounded-full bg-aqua shadow-[0_0_0_1px_rgba(45,212,191,0.14)]"
        >
          <div className="pointer-events-none absolute top-1/2 -z-10 h-px w-12.5 -translate-y-1/2 bg-gradient-to-r from-aqua/80 to-transparent" />
        </span>
      ))}
    </div>
  );
}
