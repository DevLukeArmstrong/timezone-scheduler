import { isSameDay } from "date-fns";
import type { AvailabilityOccurrence } from "@/lib/services/availability";
import {
  DEFAULT_SCROLL_HOUR,
  GRID_END_HOUR,
  GRID_START_HOUR,
  WEEKDAY_LABELS,
  layoutGroupSlotsForWeek,
} from "@/lib/calendar";
import { utcToWallClock } from "@/lib/timezone";
import { getMemberColor } from "@/lib/member-colors";
import { OwnOccurrenceActions } from "@/components/own-occurrence-actions";
import { CalendarScrollContainer } from "@/components/calendar-scroll-container";

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => i + GRID_START_HOUR,
);
const ROW_HEIGHT_REM = 4;
const LANE_GAP_PX = 2;
const GRID_MAX_HEIGHT = "70vh";

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display} ${period}`;
}

export interface CalendarLegendMember {
  id: string;
  name: string | null;
  email: string;
}

interface CalendarGridProps {
  /** Concrete occurrences (one-offs + expanded recurring) for the visible week. */
  occurrences: AvailabilityOccurrence[];
  /** Every distinct member across the currently-selected groups, for the color legend. */
  members: CalendarLegendMember[];
  timeZone: string;
  weekDays: Date[];
  viewerId: string;
  /** True when the viewer belongs to more than one group so slot labels disambiguate by group name. */
  showGroupNames: boolean;
}

/**
 * The group-aware calendar grid: renders every selected group's members'
 * availability overlaid on one 7-day view, side-by-side in lanes where
 * times overlap. Recurring rules are expanded into concrete occurrences
 * before layout.
 */
export function CalendarGrid({
  occurrences,
  members,
  timeZone,
  weekDays,
  viewerId,
  showGroupNames,
}: CalendarGridProps) {
  const positioned = layoutGroupSlotsForWeek(occurrences, timeZone, weekDays);
  const today = utcToWallClock(new Date(), timeZone);
  const gridHeight = `${HOURS.length * ROW_HEIGHT_REM}rem`;
  const memberIndexById = new Map(members.map((member, index) => [member.id, index]));

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] border-b border-zinc-200 dark:border-zinc-800">
          <div className="border-r border-zinc-200 p-2 dark:border-zinc-800" />
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={i}
                className={`border-r border-zinc-200 p-3 text-center last:border-r-0 dark:border-zinc-800 ${
                  isToday ? "bg-zinc-50 dark:bg-zinc-800/50" : ""
                }`}
              >
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {WEEKDAY_LABELS[i]}
                </div>
                <div
                  className={`mt-0.5 text-lg font-semibold ${
                    isToday
                      ? "text-zinc-900 dark:text-zinc-50"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        <CalendarScrollContainer scrollToHour={DEFAULT_SCROLL_HOUR} maxHeight={GRID_MAX_HEIGHT}>
          <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))]">
            <div className="flex flex-col border-r border-zinc-200 dark:border-zinc-800">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  data-hour={hour}
                  style={{ height: `${ROW_HEIGHT_REM}rem` }}
                  className="flex items-start justify-end border-b border-zinc-100 px-2 py-1 text-xs text-zinc-400 last:border-b-0 dark:border-zinc-800/60"
                >
                  {formatHour(hour)}
                </div>
              ))}
            </div>

            {weekDays.map((day, dayIndex) => (
              <div
                key={dayIndex}
                style={{ height: gridHeight }}
                className={`relative border-r border-zinc-100 last:border-r-0 dark:border-zinc-800/60 ${
                  isSameDay(day, today) ? "bg-zinc-50/50 dark:bg-zinc-800/20" : ""
                }`}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: `${ROW_HEIGHT_REM}rem` }}
                    className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60"
                  />
                ))}

                {positioned
                  .filter((p) => p.dayIndex === dayIndex)
                  .map((p) => {
                    const memberIndex = memberIndexById.get(p.occurrence.user.id) ?? 0;
                    const color = getMemberColor(memberIndex);
                    const isOwn = p.occurrence.user.id === viewerId;
                    const ownerName = p.occurrence.user.name ?? p.occurrence.user.email;
                    const label = showGroupNames
                      ? `${p.label} · ${p.occurrence.group.name}`
                      : p.label;
                    const leftPercent = (p.lane / p.laneCount) * 100;
                    const style = {
                      top: `${p.topPercent}%`,
                      height: `${p.heightPercent}%`,
                      left: `${leftPercent}%`,
                      width: `calc(${100 / p.laneCount}% - ${LANE_GAP_PX}px)`,
                    };

                    if (isOwn) {
                      return (
                        <OwnOccurrenceActions
                          key={`${p.occurrence.occurrenceKey}-${dayIndex}`}
                          slotId={p.occurrence.slotId}
                          occurrenceDate={p.occurrence.occurrenceDate}
                          isRecurring={p.occurrence.isRecurring}
                          label={label}
                          style={style}
                          className={`group absolute overflow-hidden rounded-md border ${color.border} ${color.bg} ${color.text}`}
                        >
                          <span className="truncate text-[10px] font-semibold">
                            You{p.occurrence.isRecurring ? " · ↻" : ""}
                          </span>
                          <span className="truncate text-[10px]">{label}</span>
                        </OwnOccurrenceActions>
                      );
                    }

                    return (
                      <div
                        key={`${p.occurrence.occurrenceKey}-${dayIndex}`}
                        title={`${ownerName}: ${label}`}
                        style={style}
                        className={`absolute overflow-hidden rounded-md border p-1 text-left ${color.border} ${color.bg} ${color.text}`}
                      >
                        <span className="block truncate text-[10px] font-semibold">
                          {ownerName}
                          {p.occurrence.isRecurring ? " · ↻" : ""}
                        </span>
                        <span className="block truncate text-[10px]">{label}</span>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </CalendarScrollContainer>
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
        You can only add, edit, or remove your own slots — everyone else&apos;s
        availability here is read-only. For recurring blocks, click to remove
        one occurrence, or use &quot;all&quot; to remove the whole series.
      </p>
    </div>
  );
}
