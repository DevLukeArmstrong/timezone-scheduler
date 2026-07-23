import { addDays } from "date-fns";
import { TZDate } from "@date-fns/tz";

/**
 * A wall-clock date/time as a human would write it down, with no attached
 * offset. It only makes sense once paired with an IANA time zone.
 */
export interface WallClockTime {
  year: number;
  /** 1–12, unlike `Date`'s 0-based month. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}

/** Curated fallback for JS engines without `Intl.supportedValuesOf`. */
const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** All recognized IANA time zone identifiers, sorted alphabetically. */
export function listIanaTimeZones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return FALLBACK_TIME_ZONES;
}

/**
 * Zones surfaced first in {@link listIanaTimeZonesPinned}, in this order,
 * ahead of the alphabetical rest — these are the team's most common zones.
 */
export const PINNED_TIME_ZONES = [
  "America/Vancouver",
  "Australia/Melbourne",
  "Pacific/Auckland",
] as const;

/**
 * Like {@link listIanaTimeZones}, but with {@link PINNED_TIME_ZONES} moved to
 * the front (in that order) ahead of the alphabetical rest, for UIs that want
 * to surface the team's common zones without hiding any of the others.
 */
export function listIanaTimeZonesPinned(): string[] {
  const all = listIanaTimeZones();
  const allSet = new Set(all);
  const pinned = PINNED_TIME_ZONES.filter((tz) => allSet.has(tz));
  const pinnedSet = new Set<string>(pinned);
  const rest = all.filter((tz) => !pinnedSet.has(tz));
  return [...pinned, ...rest];
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function assertValidTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(
      `"${timeZone}" is not a recognized IANA time zone identifier.`,
    );
  }
}

/**
 * Resolves a wall-clock time in the given IANA time zone to the UTC instant
 * it refers to. This is the only place local, human-entered times should be
 * converted before hitting the database — everything downstream stays UTC.
 */
export function wallClockToUtc(time: WallClockTime, timeZone: string): Date {
  assertValidTimeZone(timeZone);
  const zoned = TZDate.tz(
    timeZone,
    time.year,
    time.month - 1,
    time.day,
    time.hour,
    time.minute,
    time.second ?? 0,
  );
  return new Date(zoned.getTime());
}

/**
 * Projects a stored UTC instant into the given IANA time zone for display.
 * The returned `TZDate` behaves like a `Date` whose getters/formatters report
 * local wall-clock values for that zone.
 */
export function utcToWallClock(instant: Date, timeZone: string): TZDate {
  assertValidTimeZone(timeZone);
  return TZDate.tz(timeZone, instant.getTime());
}

/** Calendar date parts (no time) in a given IANA zone. */
export interface LocalDateParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

/** Monday = 0 … Sunday = 6 — matches the calendar grid and recurrence bitmask. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Local calendar Y/M/D for a UTC instant in `timeZone`. Prefer this over
 * reading `Date#getUTC*` or host-local getters when the day boundary matters.
 */
export function getLocalDateParts(instant: Date, timeZone: string): LocalDateParts {
  const local = utcToWallClock(instant, timeZone);
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
  };
}

/** Formats local date parts as `yyyy-MM-dd` (stable occurrence keys / form values). */
export function formatLocalDateParts(parts: LocalDateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Parses a `yyyy-MM-dd` string into local date parts, or `null` if malformed. */
export function parseLocalDateString(value: string): LocalDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isRealLocalDate({ year, month, day }, "UTC")) return null;
  return { year, month, day };
}

/**
 * True when `parts` names a real calendar day (rejects e.g. 2024-02-30 by
 * round-tripping through {@link wallClockToUtc} in `timeZone`).
 */
export function isRealLocalDate(parts: LocalDateParts, timeZone: string): boolean {
  try {
    const instant = wallClockToUtc(
      { ...parts, hour: 12, minute: 0 },
      timeZone,
    );
    const roundTrip = getLocalDateParts(instant, timeZone);
    return (
      roundTrip.year === parts.year &&
      roundTrip.month === parts.month &&
      roundTrip.day === parts.day
    );
  } catch {
    return false;
  }
}

/**
 * Weekday index for a local calendar date in `timeZone` (Mon = 0 … Sun = 6).
 * Uses noon so DST spring-forward gaps cannot shift the civil day.
 */
export function getLocalWeekdayIndex(
  parts: LocalDateParts,
  timeZone: string,
): WeekdayIndex {
  const local = utcToWallClock(
    wallClockToUtc({ ...parts, hour: 12, minute: 0 }, timeZone),
    timeZone,
  );
  // JS: Sunday = 0 … Saturday = 6 → shift so Monday = 0.
  return ((local.getDay() + 6) % 7) as WeekdayIndex;
}

/** Compare two local calendar dates: negative if a < b, 0 if equal, positive if a > b. */
export function compareLocalDates(a: LocalDateParts, b: LocalDateParts): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/**
 * Advances a local calendar date by `deltaDays` in `timeZone` using
 * `date-fns`/`TZDate` day arithmetic (same approach as the week grid), so
 * DST transitions do not skip or duplicate a civil day.
 */
export function addLocalDays(
  parts: LocalDateParts,
  deltaDays: number,
  timeZone: string,
): LocalDateParts {
  const noon = utcToWallClock(
    wallClockToUtc({ ...parts, hour: 12, minute: 0 }, timeZone),
    timeZone,
  );
  const shifted = addDays(noon, deltaDays);
  return getLocalDateParts(new Date(shifted.getTime()), timeZone);
}

/**
 * Encodes a civil Y/M/D as a UTC-midnight `Date` for Prisma `@db.Date`
 * columns. The time-of-day is not meaningful — only the calendar triple is.
 */
export function localDatePartsToDateOnly(parts: LocalDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

/** Decodes a Prisma `@db.Date` value back to civil Y/M/D parts. */
export function dateOnlyToLocalDateParts(date: Date): LocalDateParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * Inclusive iterator over local calendar dates from `start` through `end`
 * in `timeZone`. Yields nothing when `end` is before `start`.
 */
export function* iterateLocalDates(
  start: LocalDateParts,
  end: LocalDateParts,
  timeZone: string,
): Generator<LocalDateParts> {
  if (compareLocalDates(start, end) > 0) return;
  let cursor = start;
  while (compareLocalDates(cursor, end) <= 0) {
    yield cursor;
    cursor = addLocalDays(cursor, 1, timeZone);
  }
}

/** Minutes since local midnight (0–1439) for a UTC instant in `timeZone`. */
export function getLocalMinutesSinceMidnight(
  instant: Date,
  timeZone: string,
): number {
  const local = utcToWallClock(instant, timeZone);
  return local.getHours() * 60 + local.getMinutes();
}

/** Builds a UTC instant for `parts` at `minutes` past local midnight. */
export function localDateAndMinutesToUtc(
  parts: LocalDateParts,
  minutes: number,
  timeZone: string,
): Date {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new RangeError(
      `"minutes" must be an integer in [0, 1439]; got ${minutes}.`,
    );
  }
  return wallClockToUtc(
    {
      ...parts,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
    timeZone,
  );
}

/** Parses `HH:MM` into minutes since midnight, or `null` if malformed. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Formats minutes since midnight as `HH:MM`. */
export function formatMinutesAsTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
