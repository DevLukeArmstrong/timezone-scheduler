import Link from "next/link";
import { isSameDay, isSameMonth } from "date-fns";
import type { AvailabilityOccurrence } from "@/lib/services/availability";
import {
  MONTH_LABELS,
  WEEKDAY_LABELS,
  formatDateParam,
  getMonthDays,
  summarizeOccurrencesByDay,
  withExtraQuery,
} from "@/lib/calendar";
import { formatLocalDateParts, getLocalDateParts, utcToWallClock } from "@/lib/timezone";

interface CalendarYearGridProps {
  occurrences: AvailabilityOccurrence[];
  timeZone: string;
  /** First-of-month midnights for Jan–Dec from {@link getYearMonths}. */
  yearMonths: Date[];
  /** Serialized params to preserve when drilling down (`groups=`, etc.). */
  drillExtraQuery?: string;
}

function heatClass(count: number, maxCount: number): string {
  if (count <= 0 || maxCount <= 0) {
    return "bg-zinc-100 dark:bg-zinc-800/80";
  }
  const ratio = count / maxCount;
  if (ratio <= 0.25) return "bg-emerald-200 dark:bg-emerald-900/50";
  if (ratio <= 0.5) return "bg-emerald-300 dark:bg-emerald-800/60";
  if (ratio <= 0.75) return "bg-emerald-400 dark:bg-emerald-700/70";
  return "bg-emerald-500 dark:bg-emerald-600";
}

/**
 * Year heatmap: twelve mini-months colored by how much availability falls on
 * each day. Click a day to open its week; click a month title for month view.
 */
export function CalendarYearGrid({
  occurrences,
  timeZone,
  yearMonths,
  drillExtraQuery,
}: CalendarYearGridProps) {
  const today = utcToWallClock(new Date(), timeZone);
  const byDay = summarizeOccurrencesByDay(occurrences, timeZone);
  let maxCount = 0;
  for (const summary of byDay.values()) {
    if (summary.count > maxCount) maxCount = summary.count;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {yearMonths.map((monthStart) => {
          const monthParts = getLocalDateParts(monthStart, timeZone);
          const monthDate = formatLocalDateParts(monthParts);
          const monthHref = withExtraQuery(
            `/?view=month&date=${monthDate}`,
            drillExtraQuery,
          );
          const days = getMonthDays(timeZone, monthStart);

          return (
            <section
              key={monthDate}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <Link
                  href={monthHref}
                  className="text-sm font-semibold text-zinc-800 hover:underline dark:text-zinc-100"
                >
                  {MONTH_LABELS[monthParts.month - 1]}
                </Link>
              </div>

              <div className="grid grid-cols-7 gap-0.5 p-2">
                {WEEKDAY_LABELS.map((label) => (
                  <div
                    key={label}
                    className="pb-1 text-center text-[9px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
                  >
                    {label.charAt(0)}
                  </div>
                ))}
                {days.map((day) => {
                  const inMonth = isSameMonth(day, monthStart);
                  const dateKey = formatDateParam(day);
                  const count = byDay.get(dateKey)?.count ?? 0;
                  const isToday = isSameDay(day, today);
                  const href = withExtraQuery(
                    `/?date=${dateKey}`,
                    drillExtraQuery,
                  );

                  if (!inMonth) {
                    return <div key={`${monthDate}-${dateKey}`} className="aspect-square" />;
                  }

                  return (
                    <Link
                      key={`${monthDate}-${dateKey}`}
                      href={href}
                      title={`${dateKey}: ${count} slot${count === 1 ? "" : "s"}`}
                      className={`aspect-square rounded-sm ${heatClass(count, maxCount)} ${
                        isToday ? "ring-1 ring-zinc-700 dark:ring-zinc-200" : ""
                      }`}
                    >
                      <span className="sr-only">
                        {dateKey}, {count} availability
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <span>Less</span>
        <span className="size-3 rounded-sm bg-zinc-100 dark:bg-zinc-800/80" />
        <span className="size-3 rounded-sm bg-emerald-200 dark:bg-emerald-900/50" />
        <span className="size-3 rounded-sm bg-emerald-300 dark:bg-emerald-800/60" />
        <span className="size-3 rounded-sm bg-emerald-400 dark:bg-emerald-700/70" />
        <span className="size-3 rounded-sm bg-emerald-500 dark:bg-emerald-600" />
        <span>More</span>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Click a day for its week, or a month name for the month view.
      </p>
    </div>
  );
}
