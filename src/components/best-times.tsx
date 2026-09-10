import Link from "next/link";
import { isSameDay } from "date-fns";
import type { CalendarLegendMember } from "@/components/calendar-grid";
import {
  durationMinutes,
  formatOverlapWindowLabel,
  type OverlapWindow,
} from "@/lib/overlap";
import { getOverlapHeat } from "@/lib/overlap-colors";
import { getMemberColor } from "@/lib/member-colors";
import { utcToWallClock } from "@/lib/timezone";

/** Names beyond this are collapsed into "+2 more" so a row stays one line. */
const MAX_NAMED = 3;

interface BestTimesProps {
  /** Already ranked by `rankBestTimes` — most people first. */
  windows: OverlapWindow[];
  members: CalendarLegendMember[];
  timeZone: string;
  weekDays: Date[];
  viewerId: string;
  /** True when more than one group is selected, so rows say which one. */
  showGroupNames: boolean;
  /** One href per weekday index, for jumping the phone-width grid to that day. */
  dayHrefs: string[];
  /** True when every window shown has already ended (a week in the past). */
  historical: boolean;
}

/**
 * "Best times this week" — the top few overlaps, in the viewer's own zone.
 *
 * Every row is one window out of `computeOverlapWindows`, so it names the
 * same span, the same people and the same headcount the group's Discord
 * alert would. Rows are not merged across a change in who is free: 7–10pm
 * with four people and 10–11pm with three are two different answers to
 * "when should we meet", and flattening them would print a headcount that
 * is true of neither.
 */
export function BestTimes({
  windows,
  members,
  timeZone,
  weekDays,
  viewerId,
  showGroupNames,
  dayHrefs,
  historical,
}: BestTimesProps) {
  const memberIndexById = new Map(members.map((member, index) => [member.id, index]));

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {historical ? "Best times that week" : "Best times this week"}
        </h2>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          Shown in {timeZone.replace(/_/g, " ")}
        </span>
      </div>

      {windows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
          Nobody overlaps yet this week — add your availability on the left, or
          nudge the group to add theirs.
        </p>
      ) : (
        <ol className="mt-2 space-y-1">
          {windows.map((window) => {
            const heat = getOverlapHeat(window.freeCount, window.quorumThreshold);
            const localStart = utcToWallClock(window.startTime, timeZone);
            const dayIndex = weekDays.findIndex((day) => isSameDay(day, localStart));
            // Viewer first, then the legend's own order: `memberIds` is sorted
            // by id, which would otherwise let "+2 more" swallow the one name
            // the reader is looking for.
            const ordered = [...window.memberIds].sort(
              (a, b) =>
                Number(b === viewerId) - Number(a === viewerId) ||
                (memberIndexById.get(a) ?? 0) - (memberIndexById.get(b) ?? 0),
            );
            const named = ordered.slice(0, MAX_NAMED);
            const extra = ordered.length - named.length;

            const row = (
              <>
                <span className={`size-3 shrink-0 rounded-sm ${heat.strip}`} />
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                  {formatOverlapWindowLabel(window, timeZone)}
                </span>
                <span className="text-zinc-400 dark:text-zinc-600">·</span>
                <span
                  className={`shrink-0 rounded px-1.5 text-[11px] font-semibold leading-5 ${
                    window.meetsQuorum
                      ? heat.badge
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                  title={
                    window.meetsQuorum
                      ? `Meets this group's quorum of ${window.quorumThreshold}`
                      : `${window.quorumThreshold - window.freeCount} short of this group's quorum of ${window.quorumThreshold}`
                  }
                >
                  {window.freeCount} free
                </span>
                <span className="flex min-w-0 items-center gap-1 truncate text-zinc-500 dark:text-zinc-400">
                  {named.map((id) => {
                    const index = memberIndexById.get(id);
                    const member = index === undefined ? undefined : members[index];
                    return (
                      <span key={id} className="flex shrink-0 items-center gap-1">
                        <span
                          className={`size-2 rounded-full ${getMemberColor(index ?? 0).dot}`}
                        />
                        {member
                          ? member.id === viewerId
                            ? "You"
                            : member.name ?? member.email
                          : "Someone"}
                      </span>
                    );
                  })}
                  {extra > 0 && <span className="shrink-0">+{extra} more</span>}
                </span>
                {showGroupNames && (
                  <span className="shrink-0 truncate text-zinc-400 dark:text-zinc-500">
                    · {window.groupName}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-zinc-400 dark:text-zinc-500">
                  {formatDuration(durationMinutes(window))}
                </span>
              </>
            );

            const className =
              "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 text-sm";

            // One copy of the row, not one per breakpoint: rendering it twice
            // and hiding one with CSS (the trick the day columns use) would
            // read every best time out twice to a screen reader. Following
            // the link matters on a phone, where the grid shows a day at a
            // time; on a wide screen the whole week is already visible and it
            // is a harmless no-op.
            return (
              <li key={`${window.groupId}-${window.startTime.toISOString()}`}>
                {dayIndex === -1 ? (
                  <div className={className}>{row}</div>
                ) : (
                  <Link
                    href={dayHrefs[dayIndex]}
                    scroll={false}
                    aria-label={`Show ${formatOverlapWindowLabel(window, timeZone)} on the day view`}
                    className={`${className} hover:bg-zinc-50 dark:hover:bg-zinc-800/60`}
                  >
                    {row}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
