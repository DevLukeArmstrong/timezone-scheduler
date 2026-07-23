/**
 * Local smoke checks for recurrence expansion (no DB writes).
 * Run: npx tsx scripts/verify-recurrence.mts
 */
import {
  expandRecurrenceRule,
  firstOccurrenceFromRule,
  WEEKDAY_BITS,
} from "../src/lib/recurrence";
import {
  localDateAndMinutesToUtc,
  localDatePartsToDateOnly,
} from "../src/lib/timezone";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tz = "America/Los_Angeles";

// Week of Mon 20 Jul 2026 – Sun 26 Jul 2026 in LA
const weekStart = localDateAndMinutesToUtc(
  { year: 2026, month: 7, day: 20 },
  0,
  tz,
);
const weekEnd = localDateAndMinutesToUtc(
  { year: 2026, month: 7, day: 27 },
  0,
  tz,
);

const monFri = expandRecurrenceRule(
  {
    timeZone: tz,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
    daysOfWeek:
      WEEKDAY_BITS.mon |
      WEEKDAY_BITS.tue |
      WEEKDAY_BITS.wed |
      WEEKDAY_BITS.thu |
      WEEKDAY_BITS.fri,
    rangeStart: null,
    rangeEnd: null,
  },
  weekStart,
  weekEnd,
  [],
);

assert(monFri.length === 5, `expected 5 Mon–Fri occurrences, got ${monFri.length}`);
assert(
  monFri.map((o) => o.occurrenceDate).join(",") ===
    "2026-07-20,2026-07-21,2026-07-22,2026-07-23,2026-07-24",
  `unexpected Mon–Fri dates: ${monFri.map((o) => o.occurrenceDate).join(",")}`,
);
console.log("✓ Mon–Fri 09:00–17:00 expands to 5 weekdays in the visible week");

const datedRange = expandRecurrenceRule(
  {
    timeZone: tz,
    startMinute: 17 * 60,
    endMinute: 2 * 60,
    daysOfWeek: null,
    rangeStart: localDatePartsToDateOnly({ year: 2026, month: 7, day: 22 }),
    rangeEnd: localDatePartsToDateOnly({ year: 2026, month: 7, day: 26 }),
  },
  weekStart,
  weekEnd,
  [],
);

assert(
  datedRange.length === 5,
  `expected 5 dated-range overnight occurrences, got ${datedRange.length}`,
);
assert(
  datedRange.map((o) => o.occurrenceDate).join(",") ===
    "2026-07-22,2026-07-23,2026-07-24,2026-07-25,2026-07-26",
  `unexpected range dates: ${datedRange.map((o) => o.occurrenceDate).join(",")}`,
);

// Inclusive range end: Fri 17:00–Sat 02:00 still included when range ends Friday.
const last = datedRange[datedRange.length - 1]!;
assert(
  last.occurrenceDate === "2026-07-26",
  "range end should include the start date 2026-07-26",
);
assert(last.endTime > last.startTime, "overnight occurrence must end after start");
console.log("✓ Dated range 22–26 Jul with 17:00–02:00 (midnight span) expands inclusively");

const withException = expandRecurrenceRule(
  {
    timeZone: tz,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
    daysOfWeek:
      WEEKDAY_BITS.mon |
      WEEKDAY_BITS.tue |
      WEEKDAY_BITS.wed |
      WEEKDAY_BITS.thu |
      WEEKDAY_BITS.fri,
    rangeStart: null,
    rangeEnd: null,
  },
  weekStart,
  weekEnd,
  [{ date: localDatePartsToDateOnly({ year: 2026, month: 7, day: 22 }) }],
);
assert(withException.length === 4, "exception should drop one occurrence");
assert(
  !withException.some((o) => o.occurrenceDate === "2026-07-22"),
  "excepted date must be absent",
);
console.log("✓ RecurrenceException excludes a single occurrence");

const first = firstOccurrenceFromRule(
  {
    timeZone: tz,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
    daysOfWeek: WEEKDAY_BITS.fri,
    rangeStart: null,
    rangeEnd: null,
  },
  { year: 2026, month: 7, day: 20 }, // Monday
);
assert(first?.occurrenceDate === "2026-07-24", `expected first Fri, got ${first?.occurrenceDate}`);
console.log("✓ firstOccurrenceFromRule finds next matching weekday");

console.log("\nAll recurrence smoke checks passed.");
