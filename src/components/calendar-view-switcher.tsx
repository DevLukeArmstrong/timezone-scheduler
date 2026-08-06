import Link from "next/link";
import {
  CALENDAR_VIEWS,
  type CalendarView,
  withExtraQuery,
} from "@/lib/calendar";

const BASE_CLASSNAME =
  "rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors";
const ACTIVE_CLASSNAME =
  "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900";
const INACTIVE_CLASSNAME =
  "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800";

const VIEW_LABELS: Record<CalendarView, string> = {
  week: "Week",
  month: "Month",
  year: "Year",
};

interface CalendarViewSwitcherProps {
  basePath: string;
  view: CalendarView;
  /**
   * Other already-serialized search params to preserve (e.g. `date=` and
   * `groups=`), so switching views keeps the current reference date and filter.
   */
  extraQuery?: string;
}

/**
 * Week / Month / Year toggle driven by the `?view=` search param. Week is the
 * default and omits the param from its href.
 */
export function CalendarViewSwitcher({
  basePath,
  view,
  extraQuery,
}: CalendarViewSwitcherProps) {
  return (
    <div
      className="inline-flex rounded-lg border border-zinc-300 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
      role="group"
      aria-label="Calendar view"
    >
      {CALENDAR_VIEWS.map((option) => {
        const href =
          option === "week"
            ? withExtraQuery(basePath, extraQuery)
            : withExtraQuery(`${basePath}?view=${option}`, extraQuery);
        const isActive = option === view;
        return (
          <Link
            key={option}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`${BASE_CLASSNAME} ${isActive ? ACTIVE_CLASSNAME : INACTIVE_CLASSNAME}`}
          >
            {VIEW_LABELS[option]}
          </Link>
        );
      })}
    </div>
  );
}
