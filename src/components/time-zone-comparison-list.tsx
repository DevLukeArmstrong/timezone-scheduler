import Link from "next/link";
import { shortTimeZoneLabel, type TimeZoneConversion } from "@/lib/timezone";

interface TimeZoneComparisonListProps {
  /** From `formatTimeZoneConversions` — the viewer's own zone first, then favorites. */
  conversions: TimeZoneConversion[];
  /** Whether the viewer has any favorites; without them the list is just their own zone. */
  hasFavorites: boolean;
  /** `text-xs` in the small hover popovers, `text-sm` in the sidebar form. */
  size?: "xs" | "sm";
}

/**
 * The "converts to" rows: the viewer's own zone, marked "(you)" and set
 * slightly apart, then each favorite zone. One component so the sidebar
 * form, the drag-to-add popover and the hover preview all read the same.
 */
export function TimeZoneComparisonList({
  conversions,
  hasFavorites,
  size = "xs",
}: TimeZoneComparisonListProps) {
  const textSize = size === "sm" ? "text-sm" : "text-xs";
  return (
    <div className="space-y-1">
      <ul className={`space-y-0.5 ${textSize}`}>
        {conversions.map(({ zone, range, isOwn }) => (
          <li
            key={zone}
            className={`flex justify-between gap-2 ${
              isOwn
                ? "font-semibold text-zinc-900 dark:text-zinc-50"
                : "text-zinc-600 dark:text-zinc-300"
            }`}
          >
            <span
              className={`whitespace-nowrap ${
                isOwn ? "text-brand-700 dark:text-brand-300" : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {shortTimeZoneLabel(zone)}
              {isOwn ? " (you)" : ""}
            </span>
            <span className={`text-right ${isOwn ? "" : "font-medium"}`}>{range}</span>
          </li>
        ))}
      </ul>
      {!hasFavorites && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Add{" "}
          <Link href="/account" className="font-medium underline">
            favorite time zones
          </Link>{" "}
          to compare this with your friends&apos; times.
        </p>
      )}
    </div>
  );
}
