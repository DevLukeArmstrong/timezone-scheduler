import Link from "next/link";
import { addDays, subDays } from "date-fns";
import { formatWeekParam, withExtraQuery } from "@/lib/calendar";
import { WeekDatePicker } from "@/components/week-date-picker";

const BUTTON_CLASSNAME =
  "rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";

interface WeekNavProps {
  /** Route to navigate within, e.g. `/calendar` — the `?week=` param is appended to this. */
  basePath: string;
  weekDays: Date[];
  /**
   * Other already-serialized search params (e.g. the calendar's `groups=`
   * filter) to carry along on every link this renders, so navigating weeks
   * never resets an unrelated filter. Build with `serializeExtraParams`-style
   * `URLSearchParams` and pass as e.g. `"groups=abc%2Cdef"`.
   */
  extraQuery?: string;
}

/**
 * Prev/next/today controls plus a "jump to any week" date picker, driven
 * entirely by the `?week=YYYY-MM-DD` search param — every link here just
 * points at a different value of that param, computed from `weekDays[0]`
 * (already resolved server-side by `resolveWeekReference`/`getWeekDays`).
 */
export function WeekNav({ basePath, weekDays, extraQuery }: WeekNavProps) {
  const weekStart = weekDays[0];
  const prevHref = withExtraQuery(
    `${basePath}?week=${formatWeekParam(subDays(weekStart, 7))}`,
    extraQuery,
  );
  const nextHref = withExtraQuery(
    `${basePath}?week=${formatWeekParam(addDays(weekStart, 7))}`,
    extraQuery,
  );
  const todayHref = withExtraQuery(basePath, extraQuery);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={prevHref} className={BUTTON_CLASSNAME} aria-label="Previous week">
        ← Prev
      </Link>
      <Link href={todayHref} className={BUTTON_CLASSNAME}>
        Today
      </Link>
      <Link href={nextHref} className={BUTTON_CLASSNAME} aria-label="Next week">
        Next →
      </Link>
      <WeekDatePicker
        key={formatWeekParam(weekStart)}
        basePath={basePath}
        defaultValue={formatWeekParam(weekStart)}
        extraQuery={extraQuery}
      />
    </div>
  );
}
