import { addDays, format, startOfWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";
import type { AvailabilityOccurrence } from "@/lib/services/availability";
import { assertValidTimeZone, utcToWallClock, wallClockToUtc } from "@/lib/timezone";

/** The calendar grid always spans the full day; slots can start/end at any hour. */
export const GRID_START_HOUR = 0;
export const GRID_END_HOUR = 24;
/** Hour the calendar's scrollable grid is scrolled to by default, so the working day is in view on load. */
export const DEFAULT_SCROLL_HOUR = 7;
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const GRID_SPAN_HOURS = GRID_END_HOUR - GRID_START_HOUR;
const MS_PER_HOUR = 1000 * 60 * 60;

/** The Monday–Sunday week containing `reference`, expressed as local midnights in `timeZone`. */
export function getWeekDays(
  timeZone: string,
  reference: Date = new Date(),
): TZDate[] {
  assertValidTimeZone(timeZone);
  const now = TZDate.tz(timeZone, reference.getTime());
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i) as TZDate);
}

const WEEK_PARAM_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formats a date as the `yyyy-MM-dd` string the `?week=` search param and `resolveWeekReference` expect. */
export function formatWeekParam(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Validates an untrusted `?week=YYYY-MM-DD` search param and resolves it to
 * a UTC instant safe to pass into `getWeekDays` as its `reference` — noon
 * local time in `timeZone`, so the day it names can never shift to an
 * adjacent day due to the zone's offset or a DST transition. Falls back to
 * "now" (today's week) when the param is missing or malformed, including
 * calendar-invalid dates like "2024-02-30" that `Date` would otherwise
 * silently roll over.
 */
export function resolveWeekReference(
  weekParam: string | string[] | undefined,
  timeZone: string,
): Date {
  const value = Array.isArray(weekParam) ? weekParam[0] : weekParam;
  const match = value ? WEEK_PARAM_PATTERN.exec(value) : null;
  if (!match) return new Date();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const candidate = wallClockToUtc({ year, month, day, hour: 12, minute: 0 }, timeZone);
  const roundTrip = utcToWallClock(candidate, timeZone);
  const isExactDate =
    roundTrip.getFullYear() === year &&
    roundTrip.getMonth() + 1 === month &&
    roundTrip.getDate() === day;

  return isExactDate ? candidate : new Date();
}

/**
 * Validates an untrusted `?groups=id1,id2` search param against the caller-
 * supplied list of group ids the current user actually belongs to (from
 * `listGroupsForUser`), and resolves it to the set of ids to display.
 *
 * - Param absent entirely → "all groups" (the default).
 * - Param present but empty (`?groups=`) → explicitly zero groups selected.
 * - Otherwise → only the requested ids that are also in `availableGroupIds`;
 *   an id a visitor made up or copied from elsewhere is silently dropped
 *   rather than trusted, since membership is the real authorization check
 *   (done separately via `getGroupForMember` before any data is fetched).
 *
 * The result preserves `availableGroupIds`'s order, not the URL's.
 */
export function resolveGroupIdsParam(
  groupsParam: string | string[] | undefined,
  availableGroupIds: string[],
): string[] {
  if (groupsParam === undefined) return availableGroupIds;

  const value = Array.isArray(groupsParam) ? groupsParam[0] : groupsParam;
  if (value === "") return [];

  const requested = new Set(
    value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  return availableGroupIds.filter((id) => requested.has(id));
}

/**
 * Appends already-serialized `key=value` query params onto an href that may
 * or may not already have a `?query`. Used so that independent search-param
 * controls (week navigation, the group filter) can each build their own
 * links without stomping on the other's current value — see `WeekNav` and
 * `GroupFilter`, which both accept an `extraQuery` string built by this.
 */
export function withExtraQuery(href: string, extraQuery: string | undefined): string {
  if (!extraQuery) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${extraQuery}`;
}

export interface PositionedGroupSlot {
  occurrence: AvailabilityOccurrence;
  dayIndex: number;
  topPercent: number;
  heightPercent: number;
  label: string;
  /** 0-based column this slot renders in, among others that overlap it in time on the same day. */
  lane: number;
  /** Total number of side-by-side columns needed on that day for this cluster of overlapping slots. */
  laneCount: number;
}

/**
 * Projects concrete availability occurrences onto a 7-day grid in `timeZone`,
 * clipped to the `[GRID_START_HOUR, GRID_END_HOUR)` window each day. A window
 * that spans midnight (or several days) contributes one entry per day it
 * touches. Occurrences that overlap in time on the same day are placed in
 * side-by-side lanes (greedy interval coloring).
 */
export function layoutGroupSlotsForWeek(
  occurrences: AvailabilityOccurrence[],
  timeZone: string,
  weekDays: Date[],
): PositionedGroupSlot[] {
  type Clipped = Omit<PositionedGroupSlot, "lane" | "laneCount">;
  const clipped: Clipped[] = [];

  for (const occurrence of occurrences) {
    const localStart = utcToWallClock(occurrence.startTime, timeZone);
    const localEnd = utcToWallClock(occurrence.endTime, timeZone);
    const label = formatTimeRange(localStart, localEnd, timeZone);

    weekDays.forEach((dayStart, dayIndex) => {
      const dayEnd = addDays(dayStart, 1);
      if (localStart >= dayEnd || localEnd <= dayStart) return;

      const startHour = Math.max(
        GRID_START_HOUR,
        hoursSinceMidnight(localStart < dayStart ? dayStart : localStart, dayStart),
      );
      const endHour = Math.min(
        GRID_END_HOUR,
        hoursSinceMidnight(localEnd > dayEnd ? dayEnd : localEnd, dayStart),
      );
      if (endHour <= startHour) return;

      clipped.push({
        occurrence,
        dayIndex,
        topPercent: ((startHour - GRID_START_HOUR) / GRID_SPAN_HOURS) * 100,
        heightPercent: ((endHour - startHour) / GRID_SPAN_HOURS) * 100,
        label,
      });
    });
  }

  const byDay = new Map<number, Clipped[]>();
  for (const entry of clipped) {
    const list = byDay.get(entry.dayIndex);
    if (list) {
      list.push(entry);
    } else {
      byDay.set(entry.dayIndex, [entry]);
    }
  }

  const positioned: PositionedGroupSlot[] = [];
  for (const entries of byDay.values()) {
    entries.sort((a, b) => a.topPercent - b.topPercent);

    // Greedy interval-graph coloring: each slot takes the lowest-numbered
    // lane whose most recent occupant has already ended.
    const laneEndPercents: number[] = [];
    const withLanes = entries.map((entry) => {
      const entryEndPercent = entry.topPercent + entry.heightPercent;
      let lane = laneEndPercents.findIndex((end) => end <= entry.topPercent);
      if (lane === -1) {
        lane = laneEndPercents.length;
        laneEndPercents.push(entryEndPercent);
      } else {
        laneEndPercents[lane] = entryEndPercent;
      }
      return { entry, lane };
    });

    const laneCount = laneEndPercents.length;
    for (const { entry, lane } of withLanes) {
      positioned.push({ ...entry, lane, laneCount });
    }
  }

  return positioned;
}

function hoursSinceMidnight(date: Date, dayStart: Date): number {
  return (date.getTime() - dayStart.getTime()) / MS_PER_HOUR;
}

function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}
