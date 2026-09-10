import {
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { TZDate } from "@date-fns/tz";
import type { AvailabilityOccurrence } from "@/lib/services/availability";
import {
  addLocalDays,
  assertValidTimeZone,
  compareLocalDates,
  formatLocalDateParts,
  getLocalDateParts,
  utcToWallClock,
  wallClockToUtc,
} from "@/lib/timezone";

/** The calendar grid always spans the full day; slots can start/end at any hour. */
export const GRID_START_HOUR = 0;
export const GRID_END_HOUR = 24;

/**
 * The default "peak" band — the hours the week grid gives full row height to.
 * Everything outside it is compressed to a thin strip rather than hidden, so
 * the whole 24 hours stay on screen and on the same continuous scale (see
 * `buildHourScale` in calendar-grid.tsx). Per-user overrides live on
 * `User.peakStartHour` / `User.peakEndHour`.
 *
 * `PEAK_END_HOUR` is exclusive and may equal 24, meaning "through midnight".
 */
export const DEFAULT_PEAK_START_HOUR = 9;
export const DEFAULT_PEAK_END_HOUR = 24;

/**
 * Clamps untrusted peak-hour bounds (a stored preference or a form value) to
 * something the grid can render: whole hours, inside the day, and at least
 * one hour wide. A start at or after the end is nonsensical, so it falls back
 * to the defaults rather than producing an empty or inverted band.
 */
export function resolvePeakHours(
  startHour: number | null | undefined,
  endHour: number | null | undefined,
): { peakStartHour: number; peakEndHour: number } {
  const start = Number.isInteger(startHour) ? (startHour as number) : DEFAULT_PEAK_START_HOUR;
  const end = Number.isInteger(endHour) ? (endHour as number) : DEFAULT_PEAK_END_HOUR;
  const safeStart = Math.min(Math.max(start, GRID_START_HOUR), GRID_END_HOUR - 1);
  const safeEnd = Math.min(Math.max(end, GRID_START_HOUR + 1), GRID_END_HOUR);
  if (safeEnd <= safeStart) {
    return {
      peakStartHour: DEFAULT_PEAK_START_HOUR,
      peakEndHour: DEFAULT_PEAK_END_HOUR,
    };
  }
  return { peakStartHour: safeStart, peakEndHour: safeEnd };
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const CALENDAR_VIEWS = ["week", "month", "year"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const MS_PER_HOUR = 1000 * 60 * 60;
const DATE_PARAM_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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

/**
 * Full Mon–Sun month grid for the month containing `reference` (includes
 * leading/trailing days from adjacent months), as local midnights in `timeZone`.
 */
export function getMonthDays(
  timeZone: string,
  reference: Date = new Date(),
): TZDate[] {
  assertValidTimeZone(timeZone);
  const now = TZDate.tz(timeZone, reference.getTime());
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days: TZDate[] = [];
  for (let cursor = gridStart; cursor.getTime() <= gridEnd.getTime(); cursor = addDays(cursor, 1)) {
    days.push(cursor as TZDate);
  }
  return days;
}

/** The 12 calendar months of the year containing `reference`, as local midnights on the 1st. */
export function getYearMonths(
  timeZone: string,
  reference: Date = new Date(),
): TZDate[] {
  assertValidTimeZone(timeZone);
  const now = TZDate.tz(timeZone, reference.getTime());
  const january = startOfYear(now);
  return Array.from({ length: 12 }, (_, i) => addMonths(january, i) as TZDate);
}

/** Formats a date as the `yyyy-MM-dd` string calendar date search params expect. */
export function formatWeekParam(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Alias for {@link formatWeekParam} — used for `?date=` across week/month/year views. */
export function formatDateParam(date: Date): string {
  return formatWeekParam(date);
}

/**
 * Validates an untrusted `?view=` search param. Missing/unknown values fall
 * back to week so bookmarks and shared links stay safe.
 */
export function resolveCalendarView(
  viewParam: string | string[] | undefined,
): CalendarView {
  const value = Array.isArray(viewParam) ? viewParam[0] : viewParam;
  if (value === "month" || value === "year" || value === "week") return value;
  return "week";
}

/**
 * Validates an untrusted `?day=` search param — an index into the visible
 * week (0 = Monday), used only by the phone-width single-day grid.
 *
 * With no param, prefers today when it falls inside `weekDays`, so opening
 * the calendar on a phone lands on the day the viewer is actually in rather
 * than always on Monday.
 */
export function resolveWeekDayIndex(
  dayParam: string | string[] | undefined,
  weekDays: Date[],
  timeZone: string,
  now: Date = new Date(),
): number {
  const value = Array.isArray(dayParam) ? dayParam[0] : dayParam;
  if (value !== undefined && /^[0-6]$/.test(value)) return Number(value);

  const today = utcToWallClock(now, timeZone);
  const index = weekDays.findIndex((day) => isSameDay(day, today));
  return index === -1 ? 0 : index;
}

/**
 * True when `?hours=all` asks for every hour at full row height instead of
 * compressing the off-peak band. A link rather than client state, so the
 * choice survives navigation and works with JavaScript disabled — the same
 * pattern the group filter and view switcher use.
 */
export function resolveExpandedHours(
  hoursParam: string | string[] | undefined,
): boolean {
  const value = Array.isArray(hoursParam) ? hoursParam[0] : hoursParam;
  return value === "all";
}

/**
 * Validates an untrusted `YYYY-MM-DD` search param and resolves it to a UTC
 * instant safe to pass into getWeekDays/getMonthDays/getYearMonths — noon
 * local time in `timeZone`, so the day it names can never shift to an
 * adjacent day due to the zone's offset or a DST transition. Falls back to
 * "now" when the param is missing or malformed, including calendar-invalid
 * dates like "2024-02-30" that `Date` would otherwise silently roll over.
 */
export function resolveDateReference(
  dateParam: string | string[] | undefined,
  timeZone: string,
): Date {
  const value = Array.isArray(dateParam) ? dateParam[0] : dateParam;
  const match = value ? DATE_PARAM_PATTERN.exec(value) : null;
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
 * Validates an untrusted `?week=YYYY-MM-DD` search param and resolves it to
 * a UTC instant safe to pass into `getWeekDays` as its `reference`. Prefer
 * {@link resolveDateReference} for new `?date=` links; this remains for
 * backward-compatible `?week=` bookmarks.
 */
export function resolveWeekReference(
  weekParam: string | string[] | undefined,
  timeZone: string,
): Date {
  return resolveDateReference(weekParam, timeZone);
}

/**
 * Shifts the calendar's reference date by one step for the active view
 * (week ±7 days, month ±1 month, year ±1 year), returning noon local time
 * so DST cannot move the civil day.
 */
export function shiftViewReference(
  view: CalendarView,
  reference: Date,
  delta: -1 | 1,
  timeZone: string,
): Date {
  assertValidTimeZone(timeZone);
  const local = utcToWallClock(reference, timeZone);
  const shifted =
    view === "week"
      ? addDays(local, delta * 7)
      : view === "month"
        ? addMonths(local, delta)
        : addYears(local, delta);
  return wallClockToUtc(
    {
      year: shifted.getFullYear(),
      month: shifted.getMonth() + 1,
      day: shifted.getDate(),
      hour: 12,
      minute: 0,
    },
    timeZone,
  );
}

/**
 * Inclusive half-open UTC window `[start, end)` covering everything the
 * given view needs to expand (week days, month grid padding, or full year).
 */
export function getViewWindow(
  view: CalendarView,
  timeZone: string,
  reference: Date,
): { start: Date; end: Date } {
  if (view === "week") {
    const weekDays = getWeekDays(timeZone, reference);
    return {
      start: new Date(weekDays[0].getTime()),
      end: new Date(addDays(weekDays[6], 1).getTime()),
    };
  }

  if (view === "month") {
    const days = getMonthDays(timeZone, reference);
    return {
      start: new Date(days[0].getTime()),
      end: new Date(addDays(days[days.length - 1], 1).getTime()),
    };
  }

  const local = utcToWallClock(reference, timeZone);
  const yearStart = startOfYear(local);
  const nextYear = addYears(yearStart, 1);
  return {
    start: new Date(yearStart.getTime()),
    end: new Date(nextYear.getTime()),
  };
}

/** Per-day rollup used by month counts/bars and the year heatmap. */
export interface DayAvailabilitySummary {
  /** `yyyy-MM-dd` in the viewer's timezone. */
  dateKey: string;
  /** Total occurrences that touch this local day. */
  count: number;
  /** Distinct member ids with availability on this day, in first-seen order. */
  memberIds: string[];
}

/**
 * Groups concrete occurrences by local calendar day in `timeZone`. A window
 * that spans midnight contributes to every day it touches; an end exactly at
 * midnight does not include the following day.
 */
export function summarizeOccurrencesByDay(
  occurrences: AvailabilityOccurrence[],
  timeZone: string,
): Map<string, DayAvailabilitySummary> {
  const byDay = new Map<string, DayAvailabilitySummary>();

  for (const occurrence of occurrences) {
    const localStart = utcToWallClock(occurrence.startTime, timeZone);
    const localEnd = utcToWallClock(occurrence.endTime, timeZone);
    let cursor = getLocalDateParts(localStart, timeZone);
    const endParts = getLocalDateParts(localEnd, timeZone);
    const endsAtMidnight =
      localEnd.getHours() === 0 &&
      localEnd.getMinutes() === 0 &&
      localEnd.getSeconds() === 0 &&
      localEnd.getMilliseconds() === 0;
    const exclusiveEnd = endsAtMidnight
      ? endParts
      : addLocalDays(endParts, 1, timeZone);

    while (compareLocalDates(cursor, exclusiveEnd) < 0) {
      const dateKey = formatLocalDateParts(cursor);
      const existing = byDay.get(dateKey);
      if (existing) {
        existing.count += 1;
        if (!existing.memberIds.includes(occurrence.user.id)) {
          existing.memberIds.push(occurrence.user.id);
        }
      } else {
        byDay.set(dateKey, {
          dateKey,
          count: 1,
          memberIds: [occurrence.user.id],
        });
      }
      cursor = addLocalDays(cursor, 1, timeZone);
    }
  }

  return byDay;
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
 * controls (calendar navigation, the group filter, the view switcher) can
 * each build their own links without stomping on the other's current value.
 */
export function withExtraQuery(href: string, extraQuery: string | undefined): string {
  if (!extraQuery) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${extraQuery}`;
}

export interface PositionedGroupSlot {
  occurrence: AvailabilityOccurrence;
  dayIndex: number;
  /**
   * Fractional hours since local midnight on `dayIndex`, already clipped to
   * `[GRID_START_HOUR, GRID_END_HOUR]`.
   *
   * Deliberately hours rather than percentages: the grid no longer gives
   * every hour the same height (off-peak hours are compressed), so vertical
   * position isn't a fixed fraction of the day. Converting hours to pixels is
   * the renderer's job — see `buildHourScale` in calendar-grid.tsx.
   */
  startHour: number;
  endHour: number;
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

      clipped.push({ occurrence, dayIndex, startHour, endHour, label });
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
    entries.sort((a, b) => a.startHour - b.startHour);

    // Greedy interval-graph coloring: each slot takes the lowest-numbered
    // lane whose most recent occupant has already ended. Comparing hours
    // rather than percentages is the same ordering — both are monotonic in
    // time — just without the day-fraction conversion.
    const laneEndHours: number[] = [];
    const withLanes = entries.map((entry) => {
      let lane = laneEndHours.findIndex((end) => end <= entry.startHour);
      if (lane === -1) {
        lane = laneEndHours.length;
        laneEndHours.push(entry.endHour);
      } else {
        laneEndHours[lane] = entry.endHour;
      }
      return { entry, lane };
    });

    const laneCount = laneEndHours.length;
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
