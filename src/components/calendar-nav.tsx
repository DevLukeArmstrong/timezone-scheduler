import Link from "next/link";
import {
  shiftViewReference,
  type CalendarView,
  withExtraQuery,
} from "@/lib/calendar";
import { formatLocalDateParts, getLocalDateParts } from "@/lib/timezone";
import { CalendarDatePicker } from "@/components/calendar-date-picker";

const BUTTON_CLASSNAME =
  "rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

interface CalendarNavProps {
  basePath: string;
  view: CalendarView;
  /** Reference instant already resolved server-side for the active view. */
  reference: Date;
  timeZone: string;
  /**
   * Other already-serialized search params (e.g. `view=` and `groups=`) to
   * carry along on every link, so navigating never resets unrelated state.
   */
  extraQuery?: string;
}

function formatInZone(instant: Date, timeZone: string): string {
  return formatLocalDateParts(getLocalDateParts(instant, timeZone));
}

/**
 * Prev / next / today controls plus a jump-to-date picker. Step size follows
 * the active view (week ±7 days, month ±1 month, year ±1 year). Every link
 * only changes `?date=`; the server re-derives the visible period.
 */
export function CalendarNav({
  basePath,
  view,
  reference,
  timeZone,
  extraQuery,
}: CalendarNavProps) {
  const dateValue = formatInZone(reference, timeZone);
  const prevDate = formatInZone(
    shiftViewReference(view, reference, -1, timeZone),
    timeZone,
  );
  const nextDate = formatInZone(
    shiftViewReference(view, reference, 1, timeZone),
    timeZone,
  );

  const prevHref = withExtraQuery(`${basePath}?date=${prevDate}`, extraQuery);
  const nextHref = withExtraQuery(`${basePath}?date=${nextDate}`, extraQuery);
  const todayHref = withExtraQuery(basePath, extraQuery);

  const periodLabel =
    view === "week" ? "week" : view === "month" ? "month" : "year";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={prevHref} className={BUTTON_CLASSNAME} aria-label={`Previous ${periodLabel}`}>
        ← Prev
      </Link>
      <Link href={todayHref} className={BUTTON_CLASSNAME}>
        Today
      </Link>
      <Link href={nextHref} className={BUTTON_CLASSNAME} aria-label={`Next ${periodLabel}`}>
        Next →
      </Link>
      <CalendarDatePicker
        key={dateValue}
        basePath={basePath}
        defaultValue={dateValue}
        extraQuery={extraQuery}
      />
    </div>
  );
}
