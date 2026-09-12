import { db, Prisma, type AvailabilitySlot } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { markGroupsQuorumDirty } from "@/lib/services/groups";
import {
  assertValidRecurrenceRule,
  expandRecurrenceRule,
  firstOccurrenceFromRule,
  type RecurrenceRuleInput,
} from "@/lib/recurrence";
import {
  addLocalDays,
  assertValidTimeZone,
  getLocalDateParts,
  localDateAndMinutesToUtc,
  localDatePartsToDateOnly,
  parseLocalDateString,
  wallClockToUtc,
  type LocalDateParts,
  type WallClockTime,
} from "@/lib/timezone";

export interface CreateAvailabilitySlotInput {
  userId: string;
  /** A UTC instant: a `Date`, or an ISO 8601 string with an explicit offset (e.g. ending in "Z"). */
  startTime: Date | string;
  endTime: Date | string;
  /** When set, this slot belongs to that group instead of the user's personal dashboard. */
  groupId?: string;
  /** Shared across copies of the same window added to multiple groups at once. */
  batchId?: string | null;
}

/**
 * Saves a single one-off availability slot for a user, storing both bounds as
 * UTC instants. Rejects zero/negative-length windows and windows that overlap
 * an existing slot for the same user *within the same scope* — personal
 * (`groupId` unset) and each group are independent, so a user can be "free"
 * generally but still have a separate, differently-shaped commitment inside
 * a specific group at the same time.
 */
export async function createAvailabilitySlot(
  input: CreateAvailabilitySlotInput,
): Promise<AvailabilitySlot> {
  const startTime = toUtcDate(input.startTime, "startTime");
  const endTime = toUtcDate(input.endTime, "endTime");
  const groupId = input.groupId ?? null;
  const batchId = input.batchId ?? null;

  if (endTime <= startTime) {
    throw new ValidationError("endTime must be after startTime.");
  }

  await assertUserAndGroup(input.userId, groupId);
  await assertNoOverlap(input.userId, groupId, startTime, endTime);

  const slot = await db.availabilitySlot.create({
    data: { userId: input.userId, groupId, batchId, startTime, endTime },
  });
  await markGroupsQuorumDirty([groupId]);
  return slot;
}

export interface CreateAvailabilitySlotFromLocalTimeInput {
  userId: string;
  start: WallClockTime;
  end: WallClockTime;
  /** IANA time zone to interpret `start`/`end` in. Defaults to the user's stored timezone. */
  timeZone?: string;
  /** When set, this slot belongs to that group instead of the user's personal dashboard. */
  groupId?: string;
  /** Shared across copies of the same window added to multiple groups at once. */
  batchId?: string | null;
}

/**
 * Convenience wrapper for the common calendar-UI case: the caller has local,
 * human wall-clock times (e.g. "9:00 AM" picked on a grid) rather than UTC
 * instants. Converts using the given time zone — or the user's own stored
 * timezone if omitted — then delegates to `createAvailabilitySlot`.
 */
export async function createAvailabilitySlotFromLocalTime(
  input: CreateAvailabilitySlotFromLocalTimeInput,
): Promise<AvailabilitySlot> {
  const timeZone = input.timeZone ?? (await getUserTimeZoneOrThrow(input.userId));

  return createAvailabilitySlot({
    userId: input.userId,
    groupId: input.groupId,
    batchId: input.batchId,
    startTime: wallClockToUtc(input.start, timeZone),
    endTime: wallClockToUtc(input.end, timeZone),
  });
}

export interface CreateRecurringAvailabilitySlotInput {
  userId: string;
  rule: RecurrenceRuleInput;
  groupId?: string;
  batchId?: string | null;
  /**
   * Local calendar date used to find the first stored occurrence when the
   * rule has no rangeStart (unbounded days-of-week series).
   */
  fromLocalDate?: LocalDateParts;
}

/**
 * Saves a recurring availability rule. Concrete occurrences are expanded at
 * query time — only the rule (+ a first-occurrence UTC window for NOT NULL
 * columns) is persisted.
 */
export async function createRecurringAvailabilitySlot(
  input: CreateRecurringAvailabilitySlotInput,
): Promise<AvailabilitySlot> {
  assertValidTimeZone(input.rule.timeZone);
  try {
    assertValidRecurrenceRule(input.rule);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : "Invalid recurrence rule.",
    );
  }

  const groupId = input.groupId ?? null;
  const batchId = input.batchId ?? null;
  await assertUserAndGroup(input.userId, groupId);

  const fromLocalDate =
    input.fromLocalDate ??
    input.rule.rangeStart ??
    getLocalDateParts(new Date(), input.rule.timeZone);

  const first = firstOccurrenceFromRule(input.rule, fromLocalDate);
  if (!first) {
    throw new ValidationError(
      "This recurrence rule produces no occurrences — check days-of-week and date range.",
    );
  }

  // Overlap against every expanded occurrence in a bounded search window:
  // the explicit range when present, otherwise ~1 year from the first hit.
  const overlapWindowStart = first.startTime;
  const overlapWindowEnd = input.rule.rangeEnd
    ? localDateAndMinutesToUtcExclusiveEnd(
        input.rule.rangeEnd,
        input.rule.timeZone,
        input.rule.endMinute,
        input.rule.startMinute,
      )
    : new Date(first.startTime.getTime() + 366 * 24 * 60 * 60 * 1000);

  const candidates = expandRecurrenceRule(
    {
      timeZone: input.rule.timeZone,
      startMinute: input.rule.startMinute,
      endMinute: input.rule.endMinute,
      daysOfWeek: input.rule.daysOfWeek ?? null,
      rangeStart: input.rule.rangeStart
        ? localDatePartsToDateOnly(input.rule.rangeStart)
        : null,
      rangeEnd: input.rule.rangeEnd
        ? localDatePartsToDateOnly(input.rule.rangeEnd)
        : null,
    },
    overlapWindowStart,
    overlapWindowEnd,
    [],
  );

  for (const occurrence of candidates) {
    await assertNoOverlap(
      input.userId,
      groupId,
      occurrence.startTime,
      occurrence.endTime,
    );
  }

  const slot = await db.availabilitySlot.create({
    data: {
      userId: input.userId,
      groupId,
      batchId,
      startTime: first.startTime,
      endTime: first.endTime,
      recurrence: {
        create: {
          timeZone: input.rule.timeZone,
          startMinute: input.rule.startMinute,
          endMinute: input.rule.endMinute,
          daysOfWeek: input.rule.daysOfWeek ?? null,
          rangeStart: input.rule.rangeStart
            ? localDatePartsToDateOnly(input.rule.rangeStart)
            : null,
          rangeEnd: input.rule.rangeEnd
            ? localDatePartsToDateOnly(input.rule.rangeEnd)
            : null,
        },
      },
    },
  });
  await markGroupsQuorumDirty([groupId]);
  return slot;
}

const GROUP_SLOT_OWNER_SELECT = {
  id: true,
  name: true,
  email: true,
} as const;

const GROUP_SLOT_GROUP_SELECT = {
  id: true,
  name: true,
} as const;

const SLOT_RECURRENCE_INCLUDE = {
  recurrence: true,
  exceptions: true,
  user: { select: GROUP_SLOT_OWNER_SELECT },
  group: { select: GROUP_SLOT_GROUP_SELECT },
} as const;

type GroupAvailabilitySlotRaw = Prisma.AvailabilitySlotGetPayload<{
  include: typeof SLOT_RECURRENCE_INCLUDE;
}>;

/**
 * A stored slot annotated with both its owner and its (non-null) group — the
 * shape the group-aware calendar loads before expanding recurrence.
 */
export type GroupAvailabilitySlot = Omit<GroupAvailabilitySlotRaw, "group"> & {
  group: NonNullable<GroupAvailabilitySlotRaw["group"]>;
};

/**
 * A concrete availability window ready for layout/render. One-offs map 1:1
 * from a stored row; recurring rules contribute one entry per occurrence in
 * the visible window.
 */
export interface AvailabilityOccurrence {
  /** Stored AvailabilitySlot id (series id for recurring). */
  slotId: string;
  /** Stable key for React lists: slot id, or `slotId:yyyy-MM-dd` for occurrences. */
  occurrenceKey: string;
  /** Local start date of a recurring occurrence; null for one-offs. */
  occurrenceDate: string | null;
  startTime: Date;
  endTime: Date;
  batchId: string | null;
  isRecurring: boolean;
  user: GroupAvailabilitySlot["user"];
  group: GroupAvailabilitySlot["group"];
  /** Present when this occurrence came from a recurring series. */
  recurrence: GroupAvailabilitySlot["recurrence"];
}

/**
 * Lists every member's stored availability across one or more groups at once
 * (one-off rows + recurring rules, not yet expanded). Callers MUST have
 * already verified the requester is a member of every id in `groupIds`
 * (see `groups.ts#getGroupForMember`); this function itself doesn't check.
 * Returns `[]` without querying when `groupIds` is empty.
 *
 * Pass the result through {@link expandSlotsToOccurrences} with a visible
 * window before rendering the week grid.
 */
export async function listAvailabilitySlotsForGroups(
  groupIds: string[],
): Promise<GroupAvailabilitySlot[]> {
  if (groupIds.length === 0) return [];

  return db.availabilitySlot.findMany({
    where: { groupId: { in: groupIds } },
    orderBy: { startTime: "asc" },
    include: SLOT_RECURRENCE_INCLUDE,
  }) as Promise<GroupAvailabilitySlot[]>;
}

/**
 * Expands stored slots (one-off + recurring) into concrete occurrences.
 * Recurring rules without a window yield a single summary occurrence from
 * the stored first window so sidebar lists stay bounded.
 */
export function expandSlotsToOccurrences(
  slots: GroupAvailabilitySlot[],
  window?: { start: Date; end: Date },
): AvailabilityOccurrence[] {
  const occurrences: AvailabilityOccurrence[] = [];

  for (const slot of slots) {
    if (!slot.recurrence) {
      if (
        window &&
        (slot.endTime <= window.start || slot.startTime >= window.end)
      ) {
        continue;
      }
      occurrences.push({
        slotId: slot.id,
        occurrenceKey: slot.id,
        occurrenceDate: null,
        startTime: slot.startTime,
        endTime: slot.endTime,
        batchId: slot.batchId,
        isRecurring: false,
        user: slot.user,
        group: slot.group,
        recurrence: null,
      });
      continue;
    }

    if (!window) {
      occurrences.push({
        slotId: slot.id,
        occurrenceKey: slot.id,
        occurrenceDate: null,
        startTime: slot.startTime,
        endTime: slot.endTime,
        batchId: slot.batchId,
        isRecurring: true,
        user: slot.user,
        group: slot.group,
        recurrence: slot.recurrence,
      });
      continue;
    }

    const expanded = expandRecurrenceRule(
      slot.recurrence,
      window.start,
      window.end,
      slot.exceptions,
    );
    for (const occurrence of expanded) {
      occurrences.push({
        slotId: slot.id,
        occurrenceKey: `${slot.id}:${occurrence.occurrenceDate}`,
        occurrenceDate: occurrence.occurrenceDate,
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
        batchId: slot.batchId,
        isRecurring: true,
        user: slot.user,
        group: slot.group,
        recurrence: slot.recurrence,
      });
    }
  }

  occurrences.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return occurrences;
}

export interface UpdateAvailabilitySlotInput {
  userId: string;
  slotId: string;
  /** A UTC instant: a `Date`, or an ISO 8601 string with an explicit offset (e.g. ending in "Z"). */
  startTime: Date | string;
  endTime: Date | string;
}

/**
 * Updates a one-off slot's date/time window in place. Recurring series must
 * go through {@link updateRecurringAvailabilitySlot} instead — same split as
 * {@link deleteAvailabilitySlot} vs. {@link deleteAvailabilityOccurrence}.
 */
export async function updateAvailabilitySlot(
  input: UpdateAvailabilitySlotInput,
): Promise<AvailabilitySlot> {
  const startTime = toUtcDate(input.startTime, "startTime");
  const endTime = toUtcDate(input.endTime, "endTime");
  if (endTime <= startTime) {
    throw new ValidationError("endTime must be after startTime.");
  }

  const slot = await db.availabilitySlot.findFirst({
    where: { id: input.slotId, userId: input.userId },
    select: { groupId: true, recurrence: { select: { id: true } } },
  });
  if (!slot) {
    throw new NotFoundError(
      `No availability slot found with id "${input.slotId}" for this user.`,
    );
  }
  if (slot.recurrence) {
    throw new ValidationError(
      "This is a recurring series — edit it with the series form instead.",
    );
  }

  await assertNoOverlap(input.userId, slot.groupId, startTime, endTime, input.slotId);

  const updated = await db.availabilitySlot.update({
    where: { id: input.slotId },
    data: { startTime, endTime },
  });
  await markGroupsQuorumDirty([slot.groupId]);
  return updated;
}

export interface UpdateAvailabilitySlotFromLocalTimeInput {
  userId: string;
  slotId: string;
  start: WallClockTime;
  end: WallClockTime;
  /** IANA time zone to interpret `start`/`end` in. Defaults to the user's stored timezone. */
  timeZone?: string;
}

/**
 * Wall-clock convenience wrapper for {@link updateAvailabilitySlot}, matching
 * {@link createAvailabilitySlotFromLocalTime}.
 */
export async function updateAvailabilitySlotFromLocalTime(
  input: UpdateAvailabilitySlotFromLocalTimeInput,
): Promise<AvailabilitySlot> {
  const timeZone = input.timeZone ?? (await getUserTimeZoneOrThrow(input.userId));

  return updateAvailabilitySlot({
    userId: input.userId,
    slotId: input.slotId,
    startTime: wallClockToUtc(input.start, timeZone),
    endTime: wallClockToUtc(input.end, timeZone),
  });
}

export interface UpdateRecurringAvailabilitySlotInput {
  userId: string;
  slotId: string;
  startMinute: number;
  endMinute: number;
  daysOfWeek?: number | null;
  rangeStart?: LocalDateParts | null;
  rangeEnd?: LocalDateParts | null;
}

/**
 * Updates a recurring series' daily window, days-of-week, and/or date range.
 * The rule's time zone is fixed at creation and can't be changed here.
 * Mirrors {@link createRecurringAvailabilitySlot}'s validation and
 * overlap-checking, but excludes the series' own occurrences from the
 * overlap search so shrinking/shifting a window doesn't conflict with itself.
 */
export async function updateRecurringAvailabilitySlot(
  input: UpdateRecurringAvailabilitySlotInput,
): Promise<AvailabilitySlot> {
  const slot = await db.availabilitySlot.findFirst({
    where: { id: input.slotId, userId: input.userId },
    include: { recurrence: true },
  });
  if (!slot) {
    throw new NotFoundError(
      `No availability slot found with id "${input.slotId}" for this user.`,
    );
  }
  if (!slot.recurrence) {
    throw new ValidationError(
      "This is a one-off slot — edit it with the one-off form instead.",
    );
  }

  const rule: RecurrenceRuleInput = {
    timeZone: slot.recurrence.timeZone,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    daysOfWeek: input.daysOfWeek ?? null,
    rangeStart: input.rangeStart ?? null,
    rangeEnd: input.rangeEnd ?? null,
  };

  try {
    assertValidRecurrenceRule(rule);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : "Invalid recurrence rule.",
    );
  }

  const fromLocalDate = rule.rangeStart ?? getLocalDateParts(new Date(), rule.timeZone);
  const first = firstOccurrenceFromRule(rule, fromLocalDate);
  if (!first) {
    throw new ValidationError(
      "This recurrence rule produces no occurrences — check days-of-week and date range.",
    );
  }

  const overlapWindowStart = first.startTime;
  const overlapWindowEnd = rule.rangeEnd
    ? localDateAndMinutesToUtcExclusiveEnd(
        rule.rangeEnd,
        rule.timeZone,
        rule.endMinute,
        rule.startMinute,
      )
    : new Date(first.startTime.getTime() + 366 * 24 * 60 * 60 * 1000);

  const candidates = expandRecurrenceRule(
    {
      timeZone: rule.timeZone,
      startMinute: rule.startMinute,
      endMinute: rule.endMinute,
      daysOfWeek: rule.daysOfWeek ?? null,
      rangeStart: rule.rangeStart ? localDatePartsToDateOnly(rule.rangeStart) : null,
      rangeEnd: rule.rangeEnd ? localDatePartsToDateOnly(rule.rangeEnd) : null,
    },
    overlapWindowStart,
    overlapWindowEnd,
    [],
  );

  for (const occurrence of candidates) {
    await assertNoOverlap(
      input.userId,
      slot.groupId,
      occurrence.startTime,
      occurrence.endTime,
      input.slotId,
    );
  }

  const [updated] = await db.$transaction([
    db.availabilitySlot.update({
      where: { id: input.slotId },
      data: { startTime: first.startTime, endTime: first.endTime },
    }),
    db.recurrenceRule.update({
      where: { slotId: input.slotId },
      data: {
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
        daysOfWeek: rule.daysOfWeek,
        rangeStart: rule.rangeStart ? localDatePartsToDateOnly(rule.rangeStart) : null,
        rangeEnd: rule.rangeEnd ? localDatePartsToDateOnly(rule.rangeEnd) : null,
      },
    }),
  ]);

  await markGroupsQuorumDirty([slot.groupId]);
  return updated;
}

/**
 * Deletes a slot (one-off or entire recurring series), scoped to the owning
 * user so one user can never delete another's availability by guessing an id.
 */
export async function deleteAvailabilitySlot(
  userId: string,
  slotId: string,
): Promise<void> {
  const slot = await db.availabilitySlot.findFirst({
    where: { id: slotId, userId },
    select: { groupId: true },
  });
  if (!slot) {
    throw new NotFoundError(
      `No availability slot found with id "${slotId}" for this user.`,
    );
  }
  await db.availabilitySlot.delete({ where: { id: slotId } });
  await markGroupsQuorumDirty([slot.groupId]);
}

/**
 * Excludes one occurrence from a recurring series ("delete this occurrence").
 * For one-off slots, deletes the row instead.
 */
export async function deleteAvailabilityOccurrence(
  userId: string,
  slotId: string,
  occurrenceDate: string,
): Promise<void> {
  const slot = await db.availabilitySlot.findFirst({
    where: { id: slotId, userId },
    include: { recurrence: true },
  });
  if (!slot) {
    throw new NotFoundError(
      `No availability slot found with id "${slotId}" for this user.`,
    );
  }

  if (!slot.recurrence) {
    await deleteAvailabilitySlot(userId, slotId);
    return;
  }

  const parts = parseLocalDateString(occurrenceDate);
  if (!parts) {
    throw new ValidationError("occurrenceDate must be a valid yyyy-MM-dd date.");
  }

  await db.recurrenceException.upsert({
    where: {
      slotId_date: {
        slotId,
        date: localDatePartsToDateOnly(parts),
      },
    },
    create: {
      slotId,
      date: localDatePartsToDateOnly(parts),
    },
    update: {},
  });
  await markGroupsQuorumDirty([slot.groupId]);
}

/**
 * Deletes every copy the owning user created in one multi-group batch.
 * Other members' slots are never touched — the filter is always
 * `(batchId, userId)`, not batch alone.
 */
export async function deleteAvailabilitySlotsByBatch(
  userId: string,
  batchId: string,
): Promise<void> {
  if (!batchId) {
    throw new ValidationError("batchId is required.");
  }

  const slots = await db.availabilitySlot.findMany({
    where: { batchId, userId },
    select: { groupId: true },
  });
  if (slots.length === 0) {
    throw new NotFoundError(
      `No availability slots found for batch "${batchId}" for this user.`,
    );
  }
  await db.availabilitySlot.deleteMany({ where: { batchId, userId } });
  await markGroupsQuorumDirty(slots.map((slot) => slot.groupId));
}

/**
 * Whether a user has any availability — one-off or recurring — overlapping
 * `[windowStart, windowEnd)`. Pass `groupId` to ask about one group's
 * scope only (the weekly reminder posts per group, so "did you add time
 * for *this* group?" is the question); omit it to look across every scope.
 * Shares the same expansion logic as the calendar views and
 * {@link assertNoOverlap} so results always agree with what a user sees
 * on their own calendar.
 */
export async function userHasAvailabilityInWindow(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
  groupId?: string,
): Promise<boolean> {
  const slots = await db.availabilitySlot.findMany({
    where: { userId, ...(groupId !== undefined ? { groupId } : {}) },
    include: { recurrence: true, exceptions: true },
  });

  for (const slot of slots) {
    if (!slot.recurrence) {
      if (slot.startTime < windowEnd && slot.endTime > windowStart) {
        return true;
      }
      continue;
    }

    const expanded = expandRecurrenceRule(
      slot.recurrence,
      windowStart,
      windowEnd,
      slot.exceptions,
    );
    if (expanded.length > 0) return true;
  }

  return false;
}

function toUtcDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`"${field}" is not a valid date/time.`);
  }
  return date;
}

async function getUserTimeZoneOrThrow(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  if (!user) {
    throw new NotFoundError(`No user found with id "${userId}".`);
  }
  return user.timezone;
}

async function assertUserAndGroup(
  userId: string,
  groupId: string | null,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw new NotFoundError(`No user found with id "${userId}".`);
  }

  if (groupId) {
    const membership = await db.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { groupId: true },
    });
    if (!membership) {
      throw new NotFoundError(`No group found with id "${groupId}" for this user.`);
    }
  }
}

/**
 * Rejects when `startTime`–`endTime` overlaps any existing one-off slot or any
 * expanded recurring occurrence for the same user + group scope. Pass
 * `excludeSlotId` when checking an edit against everything *except* the slot
 * being edited, so shifting a window doesn't conflict with its own old shape.
 */
async function assertNoOverlap(
  userId: string,
  groupId: string | null,
  startTime: Date,
  endTime: Date,
  excludeSlotId?: string,
): Promise<void> {
  const existing = await db.availabilitySlot.findMany({
    where: {
      userId,
      groupId,
      ...(excludeSlotId ? { NOT: { id: excludeSlotId } } : {}),
    },
    include: { recurrence: true, exceptions: true },
  });

  for (const slot of existing) {
    if (!slot.recurrence) {
      if (slot.startTime < endTime && slot.endTime > startTime) {
        throw new ConflictError(
          "This availability slot overlaps with an existing one for this user.",
        );
      }
      continue;
    }

    const expanded = expandRecurrenceRule(
      slot.recurrence,
      startTime,
      endTime,
      slot.exceptions,
    );
    if (expanded.length > 0) {
      throw new ConflictError(
        "This availability slot overlaps with an existing one for this user.",
      );
    }
  }
}

/**
 * End instant of the last possible occurrence on `rangeEnd` (accounts for
 * midnight-spanning daily windows). Used as an exclusive expansion bound
 * together with interval overlap checks (`start < end && end > start`).
 */
function localDateAndMinutesToUtcExclusiveEnd(
  rangeEnd: LocalDateParts,
  timeZone: string,
  endMinute: number,
  startMinute: number,
): Date {
  const spansMidnight = endMinute < startMinute;
  const endDay = spansMidnight ? addLocalDays(rangeEnd, 1, timeZone) : rangeEnd;
  return localDateAndMinutesToUtc(endDay, endMinute, timeZone);
}
