import { db, Prisma, type AvailabilitySlot } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { wallClockToUtc, type WallClockTime } from "@/lib/timezone";

export interface CreateAvailabilitySlotInput {
  userId: string;
  /** A UTC instant: a `Date`, or an ISO 8601 string with an explicit offset (e.g. ending in "Z"). */
  startTime: Date | string;
  endTime: Date | string;
  /** When set, this slot belongs to that group instead of the user's personal dashboard. */
  groupId?: string;
}

/**
 * Saves a single availability slot for a user, storing both bounds as UTC
 * instants. Rejects zero/negative-length windows and windows that overlap an
 * existing slot for the same user *within the same scope* — personal
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

  if (endTime <= startTime) {
    throw new ValidationError("endTime must be after startTime.");
  }

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (!user) {
    throw new NotFoundError(`No user found with id "${input.userId}".`);
  }

  if (groupId) {
    const membership = await db.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId: input.userId } },
      select: { groupId: true },
    });
    if (!membership) {
      throw new NotFoundError(`No group found with id "${groupId}" for this user.`);
    }
  }

  const overlapping = await db.availabilitySlot.findFirst({
    where: {
      userId: input.userId,
      groupId,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new ConflictError(
      "This availability slot overlaps with an existing one for this user.",
    );
  }

  return db.availabilitySlot.create({
    data: { userId: input.userId, groupId, startTime, endTime },
  });
}

export interface CreateAvailabilitySlotFromLocalTimeInput {
  userId: string;
  start: WallClockTime;
  end: WallClockTime;
  /** IANA time zone to interpret `start`/`end` in. Defaults to the user's stored timezone. */
  timeZone?: string;
  /** When set, this slot belongs to that group instead of the user's personal dashboard. */
  groupId?: string;
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
    startTime: wallClockToUtc(input.start, timeZone),
    endTime: wallClockToUtc(input.end, timeZone),
  });
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

type GroupAvailabilitySlotRaw = Prisma.AvailabilitySlotGetPayload<{
  include: {
    user: { select: typeof GROUP_SLOT_OWNER_SELECT };
    group: { select: typeof GROUP_SLOT_GROUP_SELECT };
  };
}>;

/**
 * A slot annotated with both its owner and its (non-null) group — the shape
 * the group-aware calendar renders. The `group` field is always present
 * because every slot returned by `listAvailabilitySlotsForGroups` belongs
 * to one of the requested groups.
 */
export type GroupAvailabilitySlot = Omit<GroupAvailabilitySlotRaw, "group"> & {
  group: NonNullable<GroupAvailabilitySlotRaw["group"]>;
};

/**
 * Lists every member's availability across one or more groups at once —
 * this is what powers the group-aware calendar's overlay view, whether
 * showing a single group or several side by side. Callers MUST have
 * already verified the requester is a member of every id in `groupIds`
 * (see `groups.ts#getGroupForMember`); this function itself doesn't check.
 * Returns `[]` without querying when `groupIds` is empty.
 */
export async function listAvailabilitySlotsForGroups(
  groupIds: string[],
): Promise<GroupAvailabilitySlot[]> {
  if (groupIds.length === 0) return [];

  return db.availabilitySlot.findMany({
    where: { groupId: { in: groupIds } },
    orderBy: { startTime: "asc" },
    include: {
      user: { select: GROUP_SLOT_OWNER_SELECT },
      group: { select: GROUP_SLOT_GROUP_SELECT },
    },
  }) as Promise<GroupAvailabilitySlot[]>;
}

/**
 * Deletes a slot, scoped to the owning user so one user can never delete
 * another's availability by guessing an id — this holds inside groups too,
 * since a group slot's `userId` is still the only thing checked here.
 */
export async function deleteAvailabilitySlot(
  userId: string,
  slotId: string,
): Promise<void> {
  const { count } = await db.availabilitySlot.deleteMany({
    where: { id: slotId, userId },
  });
  if (count === 0) {
    throw new NotFoundError(
      `No availability slot found with id "${slotId}" for this user.`,
    );
  }
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
