"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getGroupForMember } from "@/lib/services/groups";
import {
  createAvailabilitySlotFromLocalTime,
  deleteAvailabilitySlot,
  deleteAvailabilitySlotsByBatch,
} from "@/lib/services/availability";
import type { WallClockTime } from "@/lib/timezone";
import { ConflictError, ServiceError, ValidationError } from "@/lib/errors";

export interface CalendarActionState {
  error?: string;
}

const NO_ERROR: CalendarActionState = {};

/**
 * Adds the same wall-clock window to one or more of the current user's
 * groups. Each selected group gets its own AvailabilitySlot (overlap is
 * checked per group); successful copies share a new `batchId` so they can
 * later be deleted as a set. A conflict in one group does not block the
 * others — failures are reported by group name.
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

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  // An empty end date means "same day as the start" — the common case.
  // Picking a later end date is what lets a slot span midnight.
  const endDate = String(formData.get("endDate") ?? "").trim() || date;
  const timeZone = String(formData.get("timeZone") ?? "").trim() || undefined;

  const start = parseDateAndTime(date, startTime);
  const end = parseDateAndTime(endDate, endTime);
  if (!start || !end) {
    return { error: "Please provide a valid date and start/end time." };
  }

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
  const failed: string[] = [];

  for (const group of authorized) {
    try {
      await createAvailabilitySlotFromLocalTime({
        userId,
        start,
        end,
        timeZone,
        groupId: group.id,
        batchId,
      });
      created.push(group.name);
    } catch (error) {
      // Window-shape errors apply to every group the same way — stop early
      // (nothing was written for this group; earlier groups may have succeeded).
      if (error instanceof ValidationError || error instanceof RangeError) {
        if (created.length > 0) {
          revalidatePath("/calendar");
        }
        return { error: describeError(error) };
      }
      if (error instanceof ConflictError) {
        failed.push(`${group.name} (overlaps existing availability)`);
        continue;
      }
      if (error instanceof ServiceError) {
        failed.push(`${group.name} (${error.message})`);
        continue;
      }
      console.error(error);
      failed.push(`${group.name} (something went wrong)`);
    }
  }

  if (created.length > 0) {
    revalidatePath("/calendar");
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
 * Deletes one of the *current user's own* slots. `deleteAvailabilitySlot`
 * scopes the delete to `(slotId, userId)`, so this can never remove another
 * member's slot even if `slotId` is guessed or a request is forged
 * directly — which group the slot belongs to doesn't matter here, only
 * ownership does.
 */
export async function deleteCalendarAvailabilitySlotAction(slotId: string): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  await deleteAvailabilitySlot(userId, slotId);
  revalidatePath("/calendar");
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
  revalidatePath("/calendar");
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
