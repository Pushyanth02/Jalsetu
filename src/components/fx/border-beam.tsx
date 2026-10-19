"use client";

/**
 * A beam of light traveling a panel's border ring.
 * Adapted from MagicUI BorderBeam (https://github.com/magicuidesign/magicui), MIT License.
 * The parent element must be `relative` and carry the visible border; this
 * component overlays an animated aqua→emerald comet clipped to the border ring
 * via the `.beam-ring` mask in globals.css. Disabled under reduced motion.
 */

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  reverse?: boolean;
  borderWidth?: number;
}

export function BorderBeam({
  className,
  size = 56,
  delay = 0,
  duration = 7,
  colorFrom = "#2dd4bf",
  colorTo = "#14b88a",
  reverse = false,
  borderWidth = 1.5,
}: BorderBeamProps) {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div
      aria-hidden="true"
      className={cn("beam-ring pointer-events-none absolute inset-0 rounded-[inherit]", className)}
      style={{ padding: borderWidth } as CSSProperties}
    >
      <motion.div
        className="absolute aspect-square"
        style={{
          width: size,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent 78%)`,
          borderRadius: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
        }}
        initial={{ offsetDistance: "0%" }}
        animate={{ offsetDistance: reverse ? ["100%", "0%"] : ["0%", "100%"] }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: reverse ? 0 : -delay,
        }}
      />
    </div>
  );
}
