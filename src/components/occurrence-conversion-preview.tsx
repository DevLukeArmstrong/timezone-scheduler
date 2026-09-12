"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { formatTimeZoneConversions, shortTimeZoneLabel } from "@/lib/timezone";

/** Popover width (`w-56` = 14rem) plus a little breathing room, used to keep it on-screen. */
const POPOVER_WIDTH_PX = 232;
/** Below this much room, the popover opens above the trigger instead of below it. */
const MIN_SPACE_BELOW_PX = 160;

interface PopoverCoords {
  left: number;
  placement: "above" | "below";
  y: number;
}

/**
 * Shared open/position state for a favorite-time-zone conversion popover.
 * Desktop reveals on hover; touch devices (no `:hover`) reveal on tap and
 * dismiss on an outside tap, Escape, or scroll. Rendered through a portal so
 * it can float above the calendar grid's `overflow-hidden` card without
 * getting clipped by it.
 */
function useConversionPopover<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  // Lazy-initialized (not derived in an effect) since it only gates which
  // event handlers get attached — it never affects rendered markup, so
  // there's nothing for a server/client hydration mismatch to catch.
  const [supportsHover] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches,
  );
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const triggerRef = useRef<T>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: PopoverCoords["placement"] =
      spaceBelow < MIN_SPACE_BELOW_PX && rect.top > MIN_SPACE_BELOW_PX ? "above" : "below";
    setCoords({
      left: Math.min(Math.max(rect.left, 8), window.innerWidth - POPOVER_WIDTH_PX),
      placement,
      y: placement === "below" ? rect.bottom + 4 : rect.top - 4,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: Event) {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (event.type === "mousedown" && triggerRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  return { open, setOpen, supportsHover, coords, triggerRef };
}

interface ConversionPopoverContentProps {
  coords: PopoverCoords;
  heading: string;
  startUtc: Date;
  endUtc: Date;
  displayTimeZone: string;
  favoriteTimeZones: string[];
}

function ConversionPopoverContent({
  coords,
  heading,
  startUtc,
  endUtc,
  displayTimeZone,
  favoriteTimeZones,
}: ConversionPopoverContentProps) {
  const conversions =
    favoriteTimeZones.length === 0
      ? []
      : formatTimeZoneConversions(startUtc, endUtc, favoriteTimeZones, displayTimeZone);

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: coords.left,
        top: coords.placement === "below" ? coords.y : undefined,
        bottom: coords.placement === "above" ? window.innerHeight - coords.y : undefined,
      }}
      className="z-50 w-56 space-y-1 rounded-lg border border-zinc-200 bg-white p-2.5 text-xs shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
    >
      <p className="font-medium text-zinc-700 dark:text-zinc-200">{heading}</p>
      {favoriteTimeZones.length === 0 ? (
        <p className="text-zinc-400 dark:text-zinc-500">
          Add{" "}
          <Link href="/account" className="font-medium underline">
            favorite time zones
          </Link>{" "}
          to see what this converts to for them.
        </p>
      ) : conversions.length === 0 ? (
        <p className="text-zinc-400 dark:text-zinc-500">
          Already in every one of your favorite time zones.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {conversions.map(({ zone, range }) => (
            <li
              key={zone}
              className="flex justify-between gap-2 text-zinc-600 dark:text-zinc-300"
            >
              <span className="text-zinc-400 dark:text-zinc-500">
                {shortTimeZoneLabel(zone)}
              </span>
              <span className="font-medium">{range}</span>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
}

interface ConversionData {
  startUtc: Date;
  endUtc: Date;
  displayTimeZone: string;
  favoriteTimeZones: string[];
  heading: string;
}

interface OccurrenceConversionPreviewProps extends ConversionData {
  style: CSSProperties;
  className: string;
  children: ReactNode;
}

/**
 * Wraps a whole (read-only, someone-else's) occurrence block: hovering or
 * tapping it reveals the "converts to" popover, matching the label already
 * shown on the block. Takes over the block's absolute-positioning props
 * (`style`/`className`) since it becomes the outermost element.
 */
export function OccurrenceConversionPreview({
  style,
  className,
  children,
  ...data
}: OccurrenceConversionPreviewProps) {
  const { open, setOpen, supportsHover, coords, triggerRef } =
    useConversionPopover<HTMLDivElement>();

  return (
    <>
      <div
        ref={triggerRef}
        style={style}
        className={className}
        onMouseEnter={supportsHover ? () => setOpen(true) : undefined}
        onMouseLeave={supportsHover ? () => setOpen(false) : undefined}
        onClick={supportsHover ? undefined : () => setOpen((value) => !value)}
      >
        {children}
      </div>
      {open && coords && <ConversionPopoverContent coords={coords} {...data} />}
    </>
  );
}

interface ConversionPreviewButtonProps extends ConversionData {
  className: string;
}

/**
 * A small standalone "info" badge, for occurrence blocks whose own tap
 * gesture is already spoken for (the viewer's own blocks delete on tap) —
 * see {@link OccurrenceConversionPreview} for the whole-block version used
 * on everyone else's occurrences.
 */
export function ConversionPreviewButton({ className, ...data }: ConversionPreviewButtonProps) {
  const { open, setOpen, supportsHover, coords, triggerRef } =
    useConversionPopover<HTMLButtonElement>();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Time zone conversions"
        aria-label="Time zone conversions"
        onMouseEnter={supportsHover ? () => setOpen(true) : undefined}
        onMouseLeave={supportsHover ? () => setOpen(false) : undefined}
        onClick={supportsHover ? undefined : () => setOpen((value) => !value)}
        className={className}
      >
        🌐
      </button>
      {open && coords && <ConversionPopoverContent coords={coords} {...data} />}
    </>
  );
}
