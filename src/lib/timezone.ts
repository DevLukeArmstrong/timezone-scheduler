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
