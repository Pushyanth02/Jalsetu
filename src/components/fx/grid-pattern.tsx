"use client";

/**
 * SVG grid pattern — engineered blueprint backdrop.
 * Adapted from MagicUI GridPattern (https://github.com/magicuidesign/magicui), MIT License.
 * Tint via `text-<color>` (stroke uses currentColor). Decorative only — always aria-hidden.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";

interface GridPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  strokeDasharray?: string;
  className?: string;
}

export function GridPattern({
  width = 44,
  height = 44,
  x = -1,
  y = -1,
  strokeDasharray = "0",
  className,
  ...props
}: GridPatternProps) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full fill-current/5 stroke-current/10",
        className
      )}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill="none"
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}
