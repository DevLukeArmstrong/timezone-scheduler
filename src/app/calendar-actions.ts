"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "@/auth";
import { getGroupForMember } from "@/lib/services/groups";
import {
  createAvailabilitySlotFromLocalTime,
  createRecurringAvailabilitySlot,
  deleteAvailabilityOccurrence,
  deleteAvailabilitySlot,
  deleteAvailabilitySlotsByBatch,
  updateAvailabilitySlotFromLocalTime,
  updateRecurringAvailabilitySlot,
} from "@/lib/services/availability";
import {
  announceNewAvailability,
  type NewAvailabilityWindow,
} from "@/lib/services/notifications";
import { WEEKDAY_BITS } from "@/lib/recurrence";
import {
  parseLocalDateString,
  parseTimeToMinutes,
  type WallClockTime,
} from "@/lib/timezone";
import { ConflictError, ServiceError, ValidationError } from "@/lib/errors";

export interface CalendarActionState {
  error?: string;
}

const NO_ERROR: CalendarActionState = {};

const WEEKDAY_FORM_BITS: Record<string, number> = {
  mon: WEEKDAY_BITS.mon,
  tue: WEEKDAY_BITS.tue,
  wed: WEEKDAY_BITS.wed,
  thu: WEEKDAY_BITS.thu,
  fri: WEEKDAY_BITS.fri,
  sat: WEEKDAY_BITS.sat,
  sun: WEEKDAY_BITS.sun,
};

/**
 * Adds the same wall-clock window (one-off or recurring) to one or more of
 * the current user's groups. Each selected group gets its own AvailabilitySlot
 * (overlap is checked per group); successful copies share a new `batchId` so
 * they can later be deleted as a set. A conflict in one group does not block
 * the others — failures are reported by group name.
 */
export async function addCalendarAvailabilitySlotAction(
  _prevState: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in before adding availability." };
  }

  const groupIds = uniqueNonEmpty(
    formData.getAll("groupIds").map((value) => String(value)),
  );
  if (groupIds.length === 0) {
    return { error: "Please choose at least one group for this availability." };
  }

  const mode = String(formData.get("mode") ?? "one-off").trim();
  const timeZone = String(formData.get("timeZone") ?? "").trim() || undefined;

  // Authorization gate — never trust form `groupIds` alone; confirm
  // server-side membership before writing anything scoped to a group.
  const authorized = (
    await Promise.all(
      groupIds.map(async (groupId) => {
        const group = await getGroupForMember(groupId, userId);
        return group ? { id: group.id, name: group.name } : null;
      }),
    )
  ).filter((group): group is { id: string; name: string } => group !== null);

  if (authorized.length === 0) {
    return { error: "You are not a member of any of the selected groups." };
  }

  const batchId = crypto.randomUUID();
  const created: string[] = [];
  const createdGroupIds: string[] = [];
  const failed: string[] = [];
  // Set once the first copy is saved; the same window in every group.
  let announced: NewAvailabilityWindow | null = null;

  if (mode === "recurring") {
    const startMinute = parseTimeToMinutes(String(formData.get("startTime") ?? ""));
    const endMinute = parseTimeToMinutes(String(formData.get("endTime") ?? ""));
    if (startMinute == null || endMinute == null) {
      return { error: "Please provide a valid daily start and end time." };
    }

    const daysOfWeek = parseDaysOfWeek(formData);
    const rangeStartRaw = String(formData.get("rangeStart") ?? "").trim();
    const rangeEndRaw = String(formData.get("rangeEnd") ?? "").trim();
    const rangeStart = rangeStartRaw ? parseLocalDateString(rangeStartRaw) : null;
    const rangeEnd = rangeEndRaw ? parseLocalDateString(rangeEndRaw) : null;
    if (rangeStartRaw && !rangeStart) {
      return { error: "Please provide a valid series start date." };
    }
    if (rangeEndRaw && !rangeEnd) {
      return { error: "Please provide a valid series end date." };
    }

    const resolvedTimeZone = timeZone;
    if (!resolvedTimeZone) {
      return { error: "Please choose a time zone for the recurring rule." };
    }

    const rule = {
      timeZone: resolvedTimeZone,
      startMinute,
      endMinute,
      daysOfWeek,
      rangeStart,
      rangeEnd,
    };

    for (const group of authorized) {
      try {
        const slot = await createRecurringAvailabilitySlot({
          userId,
          groupId: group.id,
          batchId,
          rule,
        });
        created.push(group.name);
        createdGroupIds.push(group.id);
        announced ??= {
          kind: "recurring",
          rule,
          firstStart: slot.startTime,
          firstEnd: slot.endTime,
        };
      } catch (error) {
        const early = handleCreateError(error, group.name, created, failed);
        if (early) {
          if (created.length > 0) {
            revalidatePath("/");
            announceAfterResponse(userId, createdGroupIds, announced);
          }
          return early;
        }
      }
    }
  } else {
    const date = String(formData.get("date") ?? "");
    const startTime = String(formData.get("startTime") ?? "");
    const endTime = String(formData.get("endTime") ?? "");
    // An empty end date means "same day as the start" — the common case.
    // Picking a later end date is what lets a slot span midnight.
    const endDate = String(formData.get("endDate") ?? "").trim() || date;

    const start = parseDateAndTime(date, startTime);
    const end = parseDateAndTime(endDate, endTime);
    if (!start || !end) {
      return { error: "Please provide a valid date and start/end time." };
    }

    for (const group of authorized) {
      try {
        const slot = await createAvailabilitySlotFromLocalTime({
          userId,
          start,
          end,
          timeZone,
          groupId: group.id,
          batchId,
        });
        created.push(group.name);
        createdGroupIds.push(group.id);
        announced ??= { kind: "one-off", startTime: slot.startTime, endTime: slot.endTime };
      } catch (error) {
        const early = handleCreateError(error, group.name, created, failed);
        if (early) {
          if (created.length > 0) {
            revalidatePath("/");
            announceAfterResponse(userId, createdGroupIds, announced);
          }
          return early;
        }
      }
    }
  }

  if (created.length > 0) {
    revalidatePath("/");
    announceAfterResponse(userId, createdGroupIds, announced);
  }

  if (failed.length > 0) {
    const parts: string[] = [];
    if (created.length > 0) {
      parts.push(`Added to ${joinNames(created)}.`);
    }
    parts.push(`Couldn't add to ${joinNames(failed)}.`);
    return { error: parts.join(" ") };
  }

  if (created.length === 0) {
    return { error: "Couldn't add availability to any of the selected groups." };
  }

  return NO_ERROR;
}

/**
 * Queues the Discord "<name> is free …" post to run once the response has
 * gone out (`after()`), so the form never waits on Discord and a webhook
 * failure can't turn a successful save into an error.
 */
function announceAfterResponse(
  actorUserId: string,
  groupIds: string[],
  window: NewAvailabilityWindow | null,
): void {
  if (!window || groupIds.length === 0) return;
  after(() => announceNewAvailability({ actorUserId, groupIds, window }));
}

/**
 * Deletes one of the *current user's own* slots (one-off or entire recurring
 * series). Scoped to `(slotId, userId)`.
 */
export async function deleteCalendarAvailabilitySlotAction(slotId: string): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  await deleteAvailabilitySlot(userId, slotId);
  revalidatePath("/");
}

/**
 * Deletes a single occurrence from a recurring series, or the whole one-off
 * slot when the row is not recurring.
 */
export async function deleteCalendarAvailabilityOccurrenceAction(
  slotId: string,
  occurrenceDate: string,
): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  await deleteAvailabilityOccurrence(userId, slotId, occurrenceDate);
  revalidatePath("/");
}

/**
 * Deletes every copy the current user owns in a multi-group batch. Scoped to
 * `(batchId, userId)` so other members' availability is never affected.
 */
export async function deleteCalendarAvailabilityBatchAction(
  batchId: string,
): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  await deleteAvailabilitySlotsByBatch(userId, batchId);
  revalidatePath("/");
}

/**
 * Edits one of the current user's own one-off slots in place — date and/or
 * times. Recurring series use {@link updateCalendarAvailabilityRecurringSlotAction}
 * instead. Scoped to `(slotId, userId)` like the delete actions above.
 */
export async function updateCalendarAvailabilitySlotAction(
  slotId: string,
  _prevState: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in before editing availability." };
  }

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const endDate = String(formData.get("endDate") ?? "").trim() || date;
  const timeZone = String(formData.get("timeZone") ?? "").trim() || undefined;

  const start = parseDateAndTime(date, startTime);
  const end = parseDateAndTime(endDate, endTime);
  if (!start || !end) {
    return { error: "Please provide a valid date and start/end time." };
  }

  try {
    await updateAvailabilitySlotFromLocalTime({ userId, slotId, start, end, timeZone });
  } catch (error) {
    return { error: describeError(error) };
  }

  revalidatePath("/");
  return NO_ERROR;
}

/**
 * Edits one of the current user's own recurring series — daily window,
 * days-of-week, and/or date range, applied to the whole series. Scoped to
 * `(slotId, userId)` like the delete actions above.
 */
export async function updateCalendarAvailabilityRecurringSlotAction(
  slotId: string,
  _prevState: CalendarActionState,
  formData: FormData,
): Promise<CalendarActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in before editing availability." };
  }

  const startMinute = parseTimeToMinutes(String(formData.get("startTime") ?? ""));
  const endMinute = parseTimeToMinutes(String(formData.get("endTime") ?? ""));
  if (startMinute == null || endMinute == null) {
    return { error: "Please provide a valid daily start and end time." };
  }

  const daysOfWeek = parseDaysOfWeek(formData);
  const rangeStartRaw = String(formData.get("rangeStart") ?? "").trim();
  const rangeEndRaw = String(formData.get("rangeEnd") ?? "").trim();
  const rangeStart = rangeStartRaw ? parseLocalDateString(rangeStartRaw) : null;
  const rangeEnd = rangeEndRaw ? parseLocalDateString(rangeEndRaw) : null;
  if (rangeStartRaw && !rangeStart) {
    return { error: "Please provide a valid series start date." };
  }
  if (rangeEndRaw && !rangeEnd) {
    return { error: "Please provide a valid series end date." };
  }

  try {
    await updateRecurringAvailabilitySlot({
      userId,
      slotId,
      startMinute,
      endMinute,
      daysOfWeek,
      rangeStart,
      rangeEnd,
    });
  } catch (error) {
    return { error: describeError(error) };
  }

  revalidatePath("/");
  return NO_ERROR;
}

function parseDaysOfWeek(formData: FormData): number | null {
  let mask = 0;
  for (const value of formData.getAll("daysOfWeek")) {
    const bit = WEEKDAY_FORM_BITS[String(value)];
    if (bit) mask |= bit;
  }
  return mask === 0 ? null : mask;
}

function handleCreateError(
  error: unknown,
  groupName: string,
  created: string[],
  failed: string[],
): CalendarActionState | null {
  // Window-shape errors apply to every group the same way — stop early
  // (nothing was written for this group; earlier groups may have succeeded).
  if (error instanceof ValidationError || error instanceof RangeError) {
    return { error: describeError(error) };
  }
  if (error instanceof ConflictError) {
    failed.push(`${groupName} (overlaps existing availability)`);
    return null;
  }
  if (error instanceof ServiceError) {
    failed.push(`${groupName} (${error.message})`);
    return null;
  }
  console.error(error);
  failed.push(`${groupName} (something went wrong)`);
  return null;
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function parseDateAndTime(date: string, time: string): WallClockTime | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  return {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
}

function describeError(error: unknown): string {
  if (error instanceof ServiceError || error instanceof RangeError) {
    return error.message;
  }
  console.error(error);
  return "Something went wrong. Please try again.";
}
