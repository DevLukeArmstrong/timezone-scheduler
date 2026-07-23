/**
 * DB smoke test: create Mon–Fri + dated-range series, expand for a week, clean up.
 * Run: npx tsx scripts/verify-recurrence-db.mts
 */
import "dotenv/config";
import {
  createRecurringAvailabilitySlot,
  deleteAvailabilityOccurrence,
  deleteAvailabilitySlot,
  expandSlotsToOccurrences,
  listAvailabilitySlotsForGroups,
} from "../src/lib/services/availability";
import { WEEKDAY_BITS } from "../src/lib/recurrence";
import { localDateAndMinutesToUtc } from "../src/lib/timezone";
import { db } from "../src/lib/db";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const membership = await db.groupMembership.findFirst({
  select: { userId: true, groupId: true },
});
if (!membership) {
  console.log("No group membership found — skipping DB verification.");
  process.exit(0);
}

const { userId, groupId } = membership;
const tz = "America/Los_Angeles";
const createdIds: string[] = [];

try {
  // Use an odd overnight window + far-future week so we don't collide with
  // whatever availability already exists for this membership.
  const monFri = await createRecurringAvailabilitySlot({
    userId,
    groupId,
    rule: {
      timeZone: tz,
      startMinute: 3 * 60 + 15,
      endMinute: 3 * 60 + 45,
      daysOfWeek:
        WEEKDAY_BITS.mon |
        WEEKDAY_BITS.tue |
        WEEKDAY_BITS.wed |
        WEEKDAY_BITS.thu |
        WEEKDAY_BITS.fri,
      rangeStart: { year: 2027, month: 3, day: 1 },
      rangeEnd: { year: 2027, month: 3, day: 12 },
    },
  });
  createdIds.push(monFri.id);

  const dated = await createRecurringAvailabilitySlot({
    userId,
    groupId,
    rule: {
      timeZone: tz,
      startMinute: 4 * 60 + 10,
      endMinute: 4 * 60 + 40,
      daysOfWeek: null,
      rangeStart: { year: 2027, month: 3, day: 3 },
      rangeEnd: { year: 2027, month: 3, day: 7 },
    },
  });
  createdIds.push(dated.id);

  const weekStart = localDateAndMinutesToUtc({ year: 2027, month: 3, day: 1 }, 0, tz);
  const weekEnd = localDateAndMinutesToUtc({ year: 2027, month: 3, day: 8 }, 0, tz);
  const slots = await listAvailabilitySlotsForGroups([groupId]);
  const mine = slots.filter((s) => createdIds.includes(s.id));
  const occurrences = expandSlotsToOccurrences(mine, {
    start: weekStart,
    end: weekEnd,
  });

  const monFriOcc = occurrences.filter((o) => o.slotId === monFri.id);
  const datedOcc = occurrences.filter((o) => o.slotId === dated.id);
  // Mon 1 – Fri 5 Mar 2027 (range ends Mar 12 but week ends Mar 8)
  assert(monFriOcc.length === 5, `Mon–Fri expected 5, got ${monFriOcc.length}`);
  // Wed 3 – Sun 7 Mar 2027
  assert(datedOcc.length === 5, `dated range expected 5, got ${datedOcc.length}`);
  console.log("✓ DB create + expand: Mon–Fri and dated range both yield 5 occurrences");

  await deleteAvailabilityOccurrence(userId, monFri.id, "2027-03-03");
  const afterDelete = expandSlotsToOccurrences(
    (await listAvailabilitySlotsForGroups([groupId])).filter((s) => s.id === monFri.id),
    { start: weekStart, end: weekEnd },
  );
  assert(afterDelete.length === 4, "delete occurrence should leave 4");
  assert(
    !afterDelete.some((o) => o.occurrenceDate === "2027-03-03"),
    "deleted occurrence still present",
  );
  console.log("✓ Delete this occurrence persists as RecurrenceException");

  // Overlap: one-off on an existing Mon–Fri day should conflict.
  let overlapped = false;
  try {
    const { createAvailabilitySlotFromLocalTime } = await import(
      "../src/lib/services/availability"
    );
    await createAvailabilitySlotFromLocalTime({
      userId,
      groupId,
      timeZone: tz,
      start: { year: 2027, month: 3, day: 1, hour: 3, minute: 20 },
      end: { year: 2027, month: 3, day: 1, hour: 3, minute: 30 },
    });
  } catch (error) {
    overlapped =
      error instanceof Error &&
      (error.name === "ConflictError" || String(error).includes("overlaps"));
  }
  assert(overlapped, "expected overlap ConflictError against expanded Mon–Fri series");
  console.log("✓ Overlap detection considers expanded recurring occurrences");
} finally {
  for (const id of createdIds) {
    try {
      await deleteAvailabilitySlot(userId, id);
    } catch {
      // already gone
    }
  }
  await db.$disconnect();
}

console.log("\nDB recurrence verification passed.");
