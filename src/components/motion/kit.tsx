"use client";

/**
 * JalSetu motion kit - OriginKit-style animated primitives built on framer-motion.
 * Restrained, purposeful motion: entrance reveals, count-ups, spotlight cards,
 * staggered lists, shine sweeps, pulsing live indicators, animated progress.
 * Every component respects prefers-reduced-motion (no transforms, opacity only).
 */

import {
  motion,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useMotionTemplate,
  type Variants,
} from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

/* ------------------------------------------------------------------ Reveal */
/** Fade + slide-up entrance on mount. The workhorse reveal. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 14,
  duration = 0.45,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------- StaggerList */
const parentVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};
function childVariants(reduce: boolean): Variants {
  return {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.34, ease: EASE } },
  };
}

/** Staggered children entrance. Wrap list rows with <StaggerItem>. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={parentVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={childVariants(Boolean(reduce))}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ CountUp */
/** Animated number count-up (spring). Formats with locale separators. */
export function CountUp({
  value,
  decimals = 0,
  suffix,
  prefix,
  className,
  duration = 1.1,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const [display, setDisplay] = useState(() => format(reduce ? value : 0, decimals, prefix, suffix));

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => {
      setDisplay(format(Math.max(0, v), decimals, prefix, suffix));
    });
    return unsub;
  }, [spring, decimals, prefix, suffix]);

  return <span className={cn("data-mono tabular-nums", className)}>{display}</span>;
}

function format(v: number, decimals: number, prefix?: string, suffix?: string) {
  const rounded = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-IN");
  return `${prefix ?? ""}${rounded}${suffix ?? ""}`;
}

/* ------------------------------------------------------------ SpotlightCard */
/** Card with a mouse-following spotlight highlight (OriginKit spotlight). */
export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(37, 99, 235, 0.07)",
}: {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-300);
  const my = useMotionValue(-300);
  const background = useMotionTemplate`radial-gradient(280px circle at ${mx}px ${my}px, ${spotlightColor}, transparent 72%)`;

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      onMouseMove={(e) => {
        if (reduce) return;
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        mx.set(e.clientX - rect.left);
        my.set(e.clientY - rect.top);
      }}
      onMouseLeave={() => {
        mx.set(-300);
        my.set(-300);
      }}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- PulseDot */
/** Pulsing live-status dot (radar ping). */
export function PulseDot({
  className,
  color = "bg-emerald-500",
  size = 8,
}: {
  className?: string;
  color?: string;
  size?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }} aria-hidden>
      {!reduce && (
        <motion.span
          className={cn("absolute inline-flex size-full rounded-full opacity-60", color)}
          animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
        />
      )}
      <span className={cn("relative inline-flex size-full rounded-full", color)} />
    </span>
  );
}

/* ---------------------------------------------------------- AnimatedProgress */
/** Progress bar that animates its fill on mount (and on value change). */
export function AnimatedProgress({
  value,
  max = 100,
  className,
  fillClassName,
  delay = 0,
}: {
  value: number;
  max?: number;
  className?: string;
  fillClassName?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink-800", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <motion.div
        className={cn("h-full rounded-full", fillClassName)}
        initial={{ width: reduce ? `${pct}%` : "0%" }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, delay, ease: EASE }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- Shine */
/** OriginKit shine sweep overlay - place inside a group with overflow-hidden. */
export function Shine({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -translate-x-[130%] bg-gradient-to-r from-transparent via-white/30 to-transparent",
        "transition-transform duration-700 ease-out group-hover:translate-x-[130%]",
        className
      )}
    />
  );
}

/* ------------------------------------------------------------ HoverLiftCard */
/** Card that lifts slightly on hover (shadow + translate). */
export function HoverLift({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      whileHover={reduce ? undefined : { y: -3 }}
      whileTap={reduce ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
    >
      {children}
    </motion.div>
  );
}

export { motion as Motion };
