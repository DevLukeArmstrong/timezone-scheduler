"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface CalendarScrollContainerProps {
  children: ReactNode;
  /** Hour (0–23) to have in view on mount — looked up via the child with `data-hour={scrollToHour}`. */
  scrollToHour: number;
  /** CSS max-height (e.g. "70vh") before the grid switches to scrolling internally. */
  maxHeight: string;
  className?: string;
}

/**
 * Wraps a tall 24-hour calendar grid in a vertically scrollable box and, on
 * mount only, scrolls it so the row marked `data-hour={scrollToHour}` sits
 * at the top — e.g. opening a full-day grid already scrolled to ~7am instead
 * of midnight. The grid itself (passed as `children`) can stay server-
 * rendered; only the scroll behavior needs to run on the client.
 */
export function CalendarScrollContainer({
  children,
  scrollToHour,
  maxHeight,
  className,
}: CalendarScrollContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-hour="${scrollToHour}"]`);
    if (!target) return;
    const offset =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
    container.scrollTop = offset;
    // Intentionally mount-only: this is the initial scroll position, not a
    // value we want to keep re-imposing over the user's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} style={{ maxHeight }} className={`overflow-y-auto ${className ?? ""}`}>
      {children}
    </div>
  );
}
