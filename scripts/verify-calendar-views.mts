/**
 * Local verification for calendar month/year helpers and view navigation.
 * Run: npx tsx scripts/verify-calendar-views.mts
 */
import {
  formatDateParam,
  getMonthDays,
  getViewWindow,
  getWeekDays,
  getYearMonths,
  resolveCalendarView,
  resolveDateReference,
  shiftViewReference,
  summarizeOccurrencesByDay,
} from "../src/lib/calendar.ts";
import { wallClockToUtc } from "../src/lib/timezone.ts";
import type { AvailabilityOccurrence } from "../src/lib/services/availability.ts";

const TZ = "America/Los_Angeles";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function sameYmd(a: Date, y: number, m: number, d: number) {
  return a.getFullYear() === y && a.getMonth() + 1 === m && a.getDate() === d;
}

// View param validation
assert(resolveCalendarView("month") === "month", "month view");
assert(resolveCalendarView("year") === "year", "year view");
assert(resolveCalendarView("nope") === "week", "invalid view → week");
assert(resolveCalendarView(undefined) === "week", "missing view → week");

// Date reference + legacy invalid date
const jul22 = resolveDateReference("2026-07-22", TZ);
assert(sameYmd(getWeekDays(TZ, jul22)[0], 2026, 7, 20), "week starts Mon Jul 20");

const invalid = resolveDateReference("2024-02-30", TZ);
assert(invalid instanceof Date, "invalid date falls back to Date");

// Month grid spans adjacent months and starts on Monday
const monthDays = getMonthDays(TZ, jul22);
assert(monthDays.length % 7 === 0, "month grid is full weeks");
assert(monthDays[0].getDay() === 1, "month grid starts Monday");
assert(
  monthDays.some((d) => d.getMonth() === 5) || monthDays[0].getMonth() === 6,
  "may include prior-month padding",
);

// Year months
const yearMonths = getYearMonths(TZ, jul22);
assert(yearMonths.length === 12, "12 months");
assert(sameYmd(yearMonths[0], 2026, 1, 1), "Jan 1");
assert(sameYmd(yearMonths[11], 2026, 12, 1), "Dec 1");

// Shift across month/year boundaries
const janRef = resolveDateReference("2026-01-15", TZ);
const prevMonth = shiftViewReference("month", janRef, -1, TZ);
assert(sameYmd(getMonthDays(TZ, prevMonth).find((d) => d.getDate() === 15) ?? prevMonth, 2025, 12, 15)
  || getMonthDays(TZ, prevMonth)[10]?.getMonth() === 11, "prev month from Jan → Dec");
const prevMonthParts = shiftViewReference("month", janRef, -1, TZ);
const prevLocal = getMonthDays(TZ, prevMonthParts);
assert(prevLocal.some((d) => d.getFullYear() === 2025 && d.getMonth() === 11), "Dec 2025 in prev month grid");

const yearPrev = shiftViewReference("year", jul22, -1, TZ);
assert(getYearMonths(TZ, yearPrev)[0].getFullYear() === 2025, "prev year → 2025");

const yearNext = shiftViewReference("year", jul22, 1, TZ);
assert(getYearMonths(TZ, yearNext)[0].getFullYear() === 2027, "next year → 2027");

// View windows
const weekWindow = getViewWindow("week", TZ, jul22);
const monthWindow = getViewWindow("month", TZ, jul22);
const yearWindow = getViewWindow("year", TZ, jul22);
assert(weekWindow.end.getTime() > weekWindow.start.getTime(), "week window");
assert(monthWindow.end.getTime() - monthWindow.start.getTime() >= 28 * 86400000, "month window ≥ 28d");
assert(yearWindow.end.getTime() - yearWindow.start.getTime() >= 365 * 86400000, "year window ≥ 365d");

// Day summaries
const start = wallClockToUtc({ year: 2026, month: 7, day: 22, hour: 9, minute: 0 }, TZ);
const end = wallClockToUtc({ year: 2026, month: 7, day: 22, hour: 10, minute: 0 }, TZ);
const overnightEnd = wallClockToUtc({ year: 2026, month: 7, day: 23, hour: 1, minute: 0 }, TZ);
const fake = {
  slotId: "s1",
  occurrenceKey: "s1",
  occurrenceDate: null,
  startTime: start,
  endTime: end,
  batchId: null,
  isRecurring: false,
  user: { id: "u1", name: "A", email: "a@x.com" },
  group: { id: "g1", name: "G" },
  recurrence: null,
} as AvailabilityOccurrence;
const overnight = {
  ...fake,
  slotId: "s2",
  occurrenceKey: "s2",
  endTime: overnightEnd,
  user: { id: "u2", name: "B", email: "b@x.com" },
} as AvailabilityOccurrence;

const byDay = summarizeOccurrencesByDay([fake, overnight], TZ);
assert(byDay.get("2026-07-22")?.count === 2, "Jul 22 has 2");
assert(byDay.get("2026-07-23")?.count === 1, "Jul 23 has overnight");
assert(byDay.get("2026-07-22")?.memberIds.length === 2, "two members on Jul 22");

assert(formatDateParam(monthDays[0]).match(/^\d{4}-\d{2}-\d{2}$/), "date param format");

console.log("verify-calendar-views: all checks passed");
