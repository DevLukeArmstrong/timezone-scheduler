import Link from "next/link";
import { isSameDay } from "date-fns";
import type { AvailabilityOccurrence } from "@/lib/services/availability";
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
  WEEKDAY_LABELS,
  layoutGroupSlotsForWeek,
  layoutOverlapWindowsForWeek,
} from "@/lib/calendar";
import { maxFreeCount, type OverlapWindow } from "@/lib/overlap";
import { getOverlapHeat, heatLegendCounts } from "@/lib/overlap-colors";
import { utcToWallClock } from "@/lib/timezone";
import { getMemberColor } from "@/lib/member-colors";
import { OwnOccurrenceActions } from "@/components/own-occurrence-actions";

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => i + GRID_START_HOUR,
);

/** Row height for hours inside the peak band — sized for a comfortable tap target. */
const PEAK_ROW_PX = 48;
/** Row height for hours outside it. Compressed, never zero: an off-peak slot
 *  still has to be visible enough to notice and tap. */
const OFFPEAK_ROW_PX = 10;
/** Floor on a rendered block's height, so a 15-minute or fully-compressed
 *  window is still large enough to see and press. */
const MIN_BLOCK_PX = 20;
/** Below this height a block only has room for one line, so the time range is dropped. */
const TWO_LINE_MIN_PX = 32;
/** Below this an hour's gutter label has no room to render legibly. */
const HOUR_LABEL_MIN_PX = 22;
const LANE_GAP_PX = 2;
/**
 * Left strip of every day column that slot blocks leave alone, so the overlap
 * shading behind them is never completely papered over. Without it the
 * densest overlap is the one you cannot see: five people free means five
 * lanes filling the column, and the shading that says "five" disappears
 * under the very blocks it is describing.
 */
const HEAT_GUTTER_PX = 12;
/** Below this height an overlap band has no room for its headcount badge. */
const HEAT_BADGE_MIN_PX = 18;

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display} ${period}`;
}

interface HourScale {
  /** Rendered pixel height of the row for `hour`. */
  rowHeight(hour: number): number;
  /** Pixels from the top of a day column to a fractional hour. */
  offsetAt(hour: number): number;
  /** Full pixel height of a day column. */
  totalHeight: number;
  isPeak(hour: number): boolean;
}

/**
 * Maps hours to vertical pixels, giving peak hours full height and
 * compressing the rest.
 *
 * The scale is cumulative and strictly increasing, which is the property the
 * whole approach rests on: because every hour still occupies *some* space and
 * hours never reorder, a window that crosses the peak boundary — an 11pm–2am
 * block, say — maps to one continuous run of pixels. It gets squashed as it
 * passes through the compressed region, but it never has to be split into
 * separate blocks or dropped, which is what would be required if off-peak
 * hours were removed from the grid instead of shrunk.
 *
 * When `expanded` is true every hour is at full height, i.e. the plain
 * uniform grid.
 */
function buildHourScale(
  peakStartHour: number,
  peakEndHour: number,
  expanded: boolean,
): HourScale {
  const isPeak = (hour: number) => hour >= peakStartHour && hour < peakEndHour;
  const rowHeight = (hour: number) =>
    expanded || isPeak(hour) ? PEAK_ROW_PX : OFFPEAK_ROW_PX;

  // offsets[h] is the top of hour h; offsets[24] is the column height.
  const offsets: number[] = [0];
  for (let hour = GRID_START_HOUR; hour < GRID_END_HOUR; hour += 1) {
    offsets.push(offsets[hour] + rowHeight(hour));
  }

  function offsetAt(hour: number): number {
    const clamped = Math.min(Math.max(hour, GRID_START_HOUR), GRID_END_HOUR);
    const whole = Math.floor(clamped);
    if (whole >= GRID_END_HOUR) return offsets[GRID_END_HOUR];
    // Interpolate within the hour's own row, so :30 lands halfway down a row
    // whatever height that row happens to have.
    return offsets[whole] + (clamped - whole) * rowHeight(whole);
  }

  return { rowHeight, offsetAt, totalHeight: offsets[GRID_END_HOUR], isPeak };
}

export interface CalendarLegendMember {
  id: string;
  name: string | null;
  email: string;
}

interface CalendarGridProps {
  /** Concrete occurrences (one-offs + expanded recurring) for the visible week. */
  occurrences: AvailabilityOccurrence[];
  /**
   * Spans where a fixed set of one group's members are all free, straight
   * from `computeOverlapWindows` — i.e. from the same `findQuorumWindows`
   * the Discord alert runs. The grid shades these; it does not recompute them.
   */
  overlapWindows: OverlapWindow[];
  /** Every distinct member across the currently-selected groups, for the color legend. */
  members: CalendarLegendMember[];
  timeZone: string;
  weekDays: Date[];
  viewerId: string;
  /** True when the viewer belongs to more than one group so slot labels disambiguate by group name. */
  showGroupNames: boolean;
  /** Hours given full row height; everything else is compressed. */
  peakStartHour: number;
  peakEndHour: number;
  /** True when the viewer has asked for every hour at full height (`?hours=all`). */
  expandedHours: boolean;
  /** Link that toggles `expandedHours`, preserving the other search params. */
  hoursToggleHref: string;
  /** Which day (0–6) is shown on phone-width screens; all seven render above `sm`. */
  mobileDayIndex: number;
  /** Links for the phone-only day stepper. They roll over into the adjacent week. */
  prevDayHref: string;
  nextDayHref: string;
}

/**
 * The group-aware calendar grid: renders every selected group's members'
 * availability overlaid on one 7-day view, side-by-side in lanes where
 * times overlap. Recurring rules are expanded into concrete occurrences
 * before layout.
 *
 * Hours are not all the same height — see {@link buildHourScale}. On phones
 * the seven day columns are still all rendered, but CSS shows only
 * `mobileDayIndex` (see `globals.css`), because seven columns on a 375px
 * screen leaves ~40px each, which is too narrow to read or tap.
 */
export function CalendarGrid({
  occurrences,
  overlapWindows,
  members,
  timeZone,
  weekDays,
  viewerId,
  showGroupNames,
  peakStartHour,
  peakEndHour,
  expandedHours,
  hoursToggleHref,
  mobileDayIndex,
  prevDayHref,
  nextDayHref,
}: CalendarGridProps) {
  const positioned = layoutGroupSlotsForWeek(occurrences, timeZone, weekDays);
  const overlapBands = layoutOverlapWindowsForWeek(overlapWindows, timeZone, weekDays);
  const densest = maxFreeCount(overlapWindows);
  // Every selected group has its own threshold, so the legend can only name a
  // number when they agree; otherwise it explains the colour, not the count.
  const thresholds = [...new Set(overlapWindows.map((w) => w.quorumThreshold))];
  const legendThreshold = thresholds.length === 1 ? thresholds[0] : null;
  const today = utcToWallClock(new Date(), timeZone);
  const memberIndexById = new Map(members.map((member, index) => [member.id, index]));
  const scale = buildHourScale(peakStartHour, peakEndHour, expandedHours);
  const gridHeight = `${scale.totalHeight}px`;

  const columnsClassName =
    "grid grid-cols-[3.25rem_minmax(0,1fr)] sm:grid-cols-[4rem_repeat(7,minmax(0,1fr))]";

  const compressedLabel = `${formatHour(GRID_START_HOUR)} – ${formatHour(peakStartHour)}${
    peakEndHour < GRID_END_HOUR ? ` and ${formatHour(peakEndHour)} – 12 AM` : ""
  }`;
  const mobileDay = weekDays[mobileDayIndex];

  return (
    <div className="space-y-3">
      {/* Phone-only day stepper: the grid shows one day at a time below `sm`. */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <Link
          href={prevDayHref}
          aria-label="Previous day"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          ←
        </Link>
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {WEEKDAY_LABELS[mobileDayIndex]} {mobileDay.getDate()}
        </span>
        <Link
          href={nextDayHref}
          aria-label="Next day"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          →
        </Link>
      </div>

      <div
        data-mobile-day={mobileDayIndex}
        className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className={`${columnsClassName} border-b border-zinc-200 dark:border-zinc-800`}>
          <div className="border-r border-zinc-200 p-2 dark:border-zinc-800" />
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={i}
                data-day-index={i}
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

        <div className={columnsClassName}>
          <div className="flex flex-col border-r border-zinc-200 dark:border-zinc-800">
            {HOURS.map((hour) => {
              const height = scale.rowHeight(hour);
              return (
                <div
                  key={hour}
                  data-hour={hour}
                  style={{ height: `${height}px` }}
                  className={`flex items-start justify-end border-b border-zinc-100 px-2 text-xs last:border-b-0 dark:border-zinc-800/60 ${
                    scale.isPeak(hour)
                      ? "py-1 text-zinc-500 dark:text-zinc-400"
                      : "text-zinc-300 dark:text-zinc-600"
                  }`}
                >
                  {height >= HOUR_LABEL_MIN_PX ? formatHour(hour) : ""}
                </div>
              );
            })}
          </div>

          {weekDays.map((day, dayIndex) => (
            <div
              key={dayIndex}
              data-day-index={dayIndex}
              style={{ height: gridHeight }}
              className={`relative border-r border-zinc-100 last:border-r-0 dark:border-zinc-800/60 ${
                isSameDay(day, today) ? "bg-zinc-50/50 dark:bg-zinc-800/20" : ""
              }`}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${scale.rowHeight(hour)}px` }}
                  className={`border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60 ${
                    scale.isPeak(hour) ? "" : "bg-zinc-50/60 dark:bg-zinc-950/40"
                  }`}
                />
              ))}

              {/*
                Overlap shading. Behind the slot blocks (DOM order decides —
                these are all absolutely positioned siblings) and on the same
                `scale.offsetAt` pixels they use, so a band lines up with the
                slots it is made of at either hour height, and a band crossing
                the peak boundary squashes through the compressed region as
                one continuous run rather than breaking in two.
              */}
              {overlapBands
                .filter((band) => band.dayIndex === dayIndex)
                .map((band) => {
                  const { window } = band;
                  const heat = getOverlapHeat(window.freeCount, window.quorumThreshold);
                  const top = scale.offsetAt(band.startHour);
                  // No minimum: bands tile the day edge to edge, so padding a
                  // short one out would push it over its neighbour.
                  const height = Math.max(2, scale.offsetAt(band.endHour) - top);
                  const who = window.memberIds
                    .map((id) => {
                      const member = members[memberIndexById.get(id) ?? -1];
                      if (!member) return "someone";
                      return member.id === viewerId ? "you" : member.name ?? member.email;
                    })
                    .join(", ");

                  return (
                    <div
                      key={`heat-${window.groupId}-${dayIndex}-${band.startHour}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                      title={`${window.freeCount} free${
                        window.meetsQuorum ? ` (quorum is ${window.quorumThreshold})` : ""
                      } · ${who}${showGroupNames ? ` · ${window.groupName}` : ""}`}
                      className={`absolute inset-x-0 ${heat.bg}`}
                    >
                      <span
                        style={{ width: `${HEAT_GUTTER_PX - 2}px` }}
                        className={`absolute inset-y-0 left-0 ${heat.strip}`}
                      />
                    </div>
                  );
                })}

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

                  const top = scale.offsetAt(p.startHour);
                  const height = Math.max(
                    MIN_BLOCK_PX,
                    scale.offsetAt(p.endHour) - top,
                  );
                  const hasRoomForTime = height >= TWO_LINE_MIN_PX;
                  // Lanes divide what is left of the column after the heat
                  // gutter, so the shading always shows through on the left
                  // however many members are stacked up here.
                  const laneFraction = p.lane / p.laneCount;
                  const style = {
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `calc(${HEAT_GUTTER_PX}px + (100% - ${HEAT_GUTTER_PX}px) * ${laneFraction})`,
                    width: `calc((100% - ${HEAT_GUTTER_PX}px) / ${p.laneCount} - ${LANE_GAP_PX}px)`,
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
                        <span className="truncate text-xs font-semibold">
                          You{p.occurrence.isRecurring ? " · ↻" : ""}
                        </span>
                        {hasRoomForTime && (
                          <span className="truncate text-[11px]">{label}</span>
                        )}
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
                      <span className="block truncate text-xs font-semibold">
                        {ownerName}
                        {p.occurrence.isRecurring ? " · ↻" : ""}
                      </span>
                      {hasRoomForTime && (
                        <span className="block truncate text-[11px]">{label}</span>
                      )}
                    </div>
                  );
                })}

              {/*
                Headcount badges last, so they sit above the blocks: at full
                density the blocks cover everything but the gutter, and a
                number is the one reading of "how many" that needs no colour
                comparison at all.
              */}
              {overlapBands
                .filter((band) => band.dayIndex === dayIndex && band.window.meetsQuorum)
                .map((band) => {
                  const top = scale.offsetAt(band.startHour);
                  if (scale.offsetAt(band.endHour) - top < HEAT_BADGE_MIN_PX) return null;
                  const heat = getOverlapHeat(
                    band.window.freeCount,
                    band.window.quorumThreshold,
                  );
                  return (
                    <span
                      key={`count-${band.window.groupId}-${dayIndex}-${band.startHour}`}
                      style={{ top: `${top + 2}px` }}
                      className={`pointer-events-none absolute right-0.5 z-10 rounded px-1 text-[10px] font-semibold leading-4 ${heat.badge}`}
                    >
                      {band.window.freeCount} free
                    </span>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={hoursToggleHref}
          scroll={false}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {expandedHours
            ? "Collapse quiet hours"
            : `Expand quiet hours (${compressedLabel})`}
        </Link>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {expandedHours
            ? "Every hour at full height."
            : `${formatHour(peakStartHour)} onwards at full height; quieter hours are compressed, not hidden.`}
        </p>
      </div>

      {densest > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">People free:</span>
          {heatLegendCounts(densest, legendThreshold ?? densest).map((count) => {
            const heat = getOverlapHeat(count, legendThreshold ?? count);
            return (
              <span key={count} className="flex items-center gap-1.5">
                <span className={`size-3 rounded-sm ${heat.strip}`} />
                {count}
              </span>
            );
          })}
          <span>
            {legendThreshold === null
              ? "· green marks a window that meets its group's quorum"
              : `· green from ${legendThreshold} — this group's quorum, the same one the Discord alert posts about`}
          </span>
        </div>
      )}

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
        availability here is read-only. For recurring blocks, tap to remove
        one occurrence, or use &quot;all&quot; to remove the whole series.
      </p>
    </div>
  );
}
