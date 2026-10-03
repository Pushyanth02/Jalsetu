"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Keyboard/screen-reader behaviour for hand-rolled overlays (the mobile nav
 * drawer, custom sheets). Radix dialogs already do this; the app's own
 * drawers do not, so this closes the gap:
 *
 *  - Escape dismisses the overlay.
 *  - Tab / Shift+Tab cycle within the overlay (focus trap).
 *  - The page behind it cannot scroll (scroll lock), and the lock is removed
 *    on unmount.
 *  - Focus moves into the overlay on open and returns to the element that
 *    opened it on close, so keyboard users are never dropped at the top of
 *    the document.
 *
 * `onClose` is read through a ref so passing an inline arrow function does not
 * re-run the effect on every render (which would repeatedly steal focus).
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalA11y({
  open,
  onClose,
  containerRef,
  lockScroll = true,
}: {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  lockScroll?: boolean;
}) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const previouslyFocused =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

    const bodyOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Move focus into the overlay (first control, or the container itself).
    const first = focusable()[0];
    (first ?? container)?.focus?.();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === firstEl || !container?.contains(active)) {
          event.preventDefault();
          lastEl.focus();
        }
      } else if (active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (lockScroll) document.body.style.overflow = bodyOverflow;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open, containerRef, lockScroll]);
}
