import type { RecurrenceException, RecurrenceRule } from "@/lib/db";
import {
  addLocalDays,
  compareLocalDates,
  dateOnlyToLocalDateParts,
  formatLocalDateParts,
  getLocalDateParts,
  getLocalWeekdayIndex,
  iterateLocalDates,
  localDateAndMinutesToUtc,
  localDatePartsToDateOnly,
  type LocalDateParts,
  type WeekdayIndex,
} from "@/lib/timezone";

/** Mon = bit 0 … Sun = bit 6. */
export const WEEKDAY_BITS = {
  mon: 1 << 0,
  tue: 1 << 1,
  wed: 1 << 2,
  thu: 1 << 3,
  fri: 1 << 4,
  sat: 1 << 5,
  sun: 1 << 6,
} as const;

export const ALL_WEEKDAYS_MASK =
  WEEKDAY_BITS.mon |
  WEEKDAY_BITS.tue |
  WEEKDAY_BITS.wed |
  WEEKDAY_BITS.thu |
  WEEKDAY_BITS.fri |
  WEEKDAY_BITS.sat |
  WEEKDAY_BITS.sun;

export interface RecurrenceRuleInput {
  timeZone: string;
  startMinute: number;
  endMinute: number;
  /** Bitmask; omit/null = every day (still subject to the date range). */
  daysOfWeek?: number | null;
  rangeStart?: LocalDateParts | null;
  rangeEnd?: LocalDateParts | null;
}

export interface ExpandedOccurrence {
  /** Local start date of this occurrence in the rule's time zone (`yyyy-MM-dd`). */
  occurrenceDate: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Validates a recurrence rule shape. Requires a daily window and at least one
 * of: a days-of-week mask, or a bounded date range (start and/or end).
 */
export function assertValidRecurrenceRule(rule: RecurrenceRuleInput): void {
  if (
    !Number.isInteger(rule.startMinute) ||
    rule.startMinute < 0 ||
    rule.startMinute >= 24 * 60
  ) {
    throw new RangeError("startMinute must be an integer in [0, 1439].");
  }
  if (
    !Number.isInteger(rule.endMinute) ||
    rule.endMinute < 0 ||
    rule.endMinute >= 24 * 60
  ) {
    throw new RangeError("endMinute must be an integer in [0, 1439].");
  }
  // Zero-length same-minute windows are invalid even when spanning midnight
  // would otherwise be expressed as endMinute === startMinute.
  if (rule.startMinute === rule.endMinute) {
    throw new RangeError("Daily end time must differ from start time.");
  }

  if (rule.daysOfWeek != null) {
    if (!Number.isInteger(rule.daysOfWeek) || rule.daysOfWeek <= 0 || rule.daysOfWeek > ALL_WEEKDAYS_MASK) {
      throw new RangeError("daysOfWeek must be a non-empty weekday bitmask.");
    }
  }

  if (rule.rangeStart && rule.rangeEnd && compareLocalDates(rule.rangeStart, rule.rangeEnd) > 0) {
    throw new RangeError("rangeEnd must be on or after rangeStart.");
  }

  const hasDays = rule.daysOfWeek != null;
  const hasRange = rule.rangeStart != null || rule.rangeEnd != null;
  if (!hasDays && !hasRange) {
    throw new RangeError(
      "A recurrence rule needs days-of-week and/or a date range.",
    );
  }
}

export function weekdayBit(index: WeekdayIndex): number {
  return 1 << index;
}

export function ruleMatchesWeekday(
  daysOfWeek: number | null | undefined,
  index: WeekdayIndex,
): boolean {
  if (daysOfWeek == null) return true;
  return (daysOfWeek & weekdayBit(index)) !== 0;
}

/**
 * Expands a stored recurrence rule into concrete UTC occurrences that
 * intersect `[windowStart, windowEnd)`. Exceptions (deleted occurrences) are
 * skipped. The series is never materialized beyond the requested window.
 */
export function expandRecurrenceRule(
  rule: Pick<
    RecurrenceRule,
    | "timeZone"
    | "startMinute"
    | "endMinute"
    | "daysOfWeek"
    | "rangeStart"
    | "rangeEnd"
  >,
  windowStart: Date,
  windowEnd: Date,
  exceptions: Pick<RecurrenceException, "date">[] = [],
): ExpandedOccurrence[] {
  if (windowEnd <= windowStart) return [];

  const timeZone = rule.timeZone;
  const spansMidnight = rule.endMinute < rule.startMinute;

  // An occurrence starting on day D can extend into D+1 when spanning midnight,
  // so walk one local day before the visible window's first local date.
  const windowLocalStart = getLocalDateParts(windowStart, timeZone);
  const windowLocalEnd = getLocalDateParts(
    new Date(windowEnd.getTime() - 1),
    timeZone,
  );
  let walkStart = addLocalDays(windowLocalStart, spansMidnight ? -1 : 0, timeZone);
  let walkEnd = windowLocalEnd;

  if (rule.rangeStart) {
    const rangeStart = dateOnlyToLocalDateParts(rule.rangeStart);
    if (compareLocalDates(walkStart, rangeStart) < 0) walkStart = rangeStart;
  }
  if (rule.rangeEnd) {
    const rangeEnd = dateOnlyToLocalDateParts(rule.rangeEnd);
    if (compareLocalDates(walkEnd, rangeEnd) > 0) walkEnd = rangeEnd;
  }

  if (compareLocalDates(walkStart, walkEnd) > 0) return [];

  const excluded = new Set(
    exceptions.map((exception) =>
      formatLocalDateParts(dateOnlyToLocalDateParts(exception.date)),
    ),
  );

  const occurrences: ExpandedOccurrence[] = [];

  for (const day of iterateLocalDates(walkStart, walkEnd, timeZone)) {
    const occurrenceDate = formatLocalDateParts(day);
    if (excluded.has(occurrenceDate)) continue;

    const weekday = getLocalWeekdayIndex(day, timeZone);
    if (!ruleMatchesWeekday(rule.daysOfWeek, weekday)) continue;

    // Inclusive range check (walk bounds already clipped, but rangeStart may
    // have been after the pre-roll day for midnight-spanning windows).
    if (rule.rangeStart) {
      const rangeStart = dateOnlyToLocalDateParts(rule.rangeStart);
      if (compareLocalDates(day, rangeStart) < 0) continue;
    }
    if (rule.rangeEnd) {
      const rangeEnd = dateOnlyToLocalDateParts(rule.rangeEnd);
      if (compareLocalDates(day, rangeEnd) > 0) continue;
    }

    const startTime = localDateAndMinutesToUtc(day, rule.startMinute, timeZone);
    const endDay = spansMidnight ? addLocalDays(day, 1, timeZone) : day;
    const endTime = localDateAndMinutesToUtc(endDay, rule.endMinute, timeZone);

    if (startTime >= windowEnd || endTime <= windowStart) continue;

    occurrences.push({ occurrenceDate, startTime, endTime });
  }

  return occurrences;
}

/**
 * Picks the first occurrence on or after `fromLocalDate` (or the range start)
 * so recurring rows can satisfy NOT NULL start/end columns.
 */
export function firstOccurrenceFromRule(
  rule: RecurrenceRuleInput,
  fromLocalDate: LocalDateParts,
): ExpandedOccurrence | null {
  assertValidRecurrenceRule(rule);

  let cursor = fromLocalDate;
  if (rule.rangeStart && compareLocalDates(cursor, rule.rangeStart) < 0) {
    cursor = rule.rangeStart;
  }

  // Bound the search: if there's a range end, stop there; otherwise walk a
  // year of candidates (enough to hit any weekday combination).
  const searchEnd =
    rule.rangeEnd ?? addLocalDays(cursor, 366, rule.timeZone);

  const fakeRule: Pick<
    RecurrenceRule,
    | "timeZone"
    | "startMinute"
    | "endMinute"
    | "daysOfWeek"
    | "rangeStart"
    | "rangeEnd"
  > = {
    timeZone: rule.timeZone,
    startMinute: rule.startMinute,
    endMinute: rule.endMinute,
    daysOfWeek: rule.daysOfWeek ?? null,
    rangeStart: rule.rangeStart
      ? localDatePartsToDateOnly(rule.rangeStart)
      : null,
    rangeEnd: rule.rangeEnd
      ? localDatePartsToDateOnly(rule.rangeEnd)
      : null,
  };

  const windowStart = localDateAndMinutesToUtc(cursor, 0, rule.timeZone);
  const windowEnd = localDateAndMinutesToUtc(
    addLocalDays(searchEnd, 2, rule.timeZone),
    0,
    rule.timeZone,
  );

  const expanded = expandRecurrenceRule(fakeRule, windowStart, windowEnd, []);
  return expanded[0] ?? null;
}
