import Link from "next/link";
import { isSameDay, isSameMonth } from "date-fns";
import type { AvailabilityOccurrence } from "@/lib/services/availability";
import {
  WEEKDAY_LABELS,
  formatDateParam,
  summarizeOccurrencesByDay,
  withExtraQuery,
} from "@/lib/calendar";
import { getMemberColor } from "@/lib/member-colors";
import { utcToWallClock } from "@/lib/timezone";
import type { CalendarLegendMember } from "@/components/calendar-grid";

interface CalendarMonthGridProps {
  occurrences: AvailabilityOccurrence[];
  members: CalendarLegendMember[];
  timeZone: string;
  /** Full Mon–Sun month grid from {@link getMonthDays}. */
  monthDays: Date[];
  /** Any day in the focused month (used to dim adjacent-month padding). */
  reference: Date;
  viewerId: string;
  /** Serialized params to preserve when drilling into a week (`groups=`, etc.). */
  drillExtraQuery?: string;
}

/**
 * Month overview: each day shows a count plus compact per-member color bars.
 * Clicking a day drills into the week view for that date.
 */
export function CalendarMonthGrid({
  occurrences,
  members,
  timeZone,
  monthDays,
  reference,
  viewerId,
  drillExtraQuery,
}: CalendarMonthGridProps) {
  const today = utcToWallClock(new Date(), timeZone);
  const focusMonth = utcToWallClock(reference, timeZone);
  const byDay = summarizeOccurrencesByDay(occurrences, timeZone);
  const memberIndexById = new Map(members.map((member, index) => [member.id, index]));

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="border-r border-zinc-200 p-2 text-center text-xs font-medium uppercase tracking-wider text-zinc-500 last:border-r-0 dark:border-zinc-800 dark:text-zinc-400"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {monthDays.map((day) => {
            const inMonth = isSameMonth(day, focusMonth);
            const isToday = isSameDay(day, today);
            const dateKey = formatDateParam(day);
            const summary = byDay.get(dateKey);
            const count = summary?.count ?? 0;
            const href = withExtraQuery(`/calendar?date=${dateKey}`, drillExtraQuery);

            return (
              <Link
                key={dateKey}
                href={href}
                className={`min-h-24 border-b border-r border-zinc-100 p-2 transition-colors last:border-r-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40 ${
                  inMonth ? "" : "bg-zinc-50/80 dark:bg-zinc-950/40"
                } ${isToday ? "ring-inset ring-1 ring-zinc-400 dark:ring-zinc-500" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={`text-sm font-semibold ${
                      isToday
                        ? "text-zinc-900 dark:text-zinc-50"
                        : inMonth
                          ? "text-zinc-700 dark:text-zinc-300"
                          : "text-zinc-400 dark:text-zinc-600"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {count > 0 && (
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {count}
                    </span>
                  )}
                </div>

                {summary && summary.memberIds.length > 0 && (
                  <div className="mt-2 flex flex-col gap-0.5">
                    {summary.memberIds.slice(0, 4).map((memberId) => {
                      const color = getMemberColor(memberIndexById.get(memberId) ?? 0);
                      const member = members.find((m) => m.id === memberId);
                      const label =
                        memberId === viewerId
                          ? "You"
                          : (member?.name ?? member?.email ?? "Member");
                      return (
                        <span
                          key={memberId}
                          title={label}
                          className={`h-1.5 rounded-sm ${color.dot}`}
                        />
                      );
                    })}
                    {summary.memberIds.length > 4 && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        +{summary.memberIds.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        {members.map((member, index) => {
          const color = getMemberColor(index);
          return (
            <span key={member.id} className="flex items-center gap-1.5">
              <span className={`size-3 rounded-sm ${color.dot}`} />
              {member.id === viewerId ? "You" : member.name ?? member.email}
            </span>
          );
        })}
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Click a day to open its week. Bars use the same per-member colors as the
        week view.
      </p>
    </div>
  );
}
