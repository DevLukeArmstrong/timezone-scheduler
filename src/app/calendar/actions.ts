"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getGroupForMember } from "@/lib/services/groups";
import {
  createAvailabilitySlotFromLocalTime,
  deleteAvailabilitySlot,
} from "@/lib/services/availability";
import type { WallClockTime } from "@/lib/timezone";
import { ServiceError } from "@/lib/errors";

export interface CalendarActionState {
  error?: string;
}

const NO_ERROR: CalendarActionState = {};

/**
 * Adds a slot to one of the current user's groups. Every slot on the
 * group-aware calendar belongs to exactly one group — there's no
 * "personal, no group" availability anymore — so `groupId` is required and
 * always re-validated server-side via `getGroupForMember`, never trusted
 * from the submitted form alone.
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

  const groupId = String(formData.get("groupId") ?? "").trim();
  if (!groupId) {
    return { error: "Please choose a group for this availability." };
  }

  // Authorization gate — never trust `groupId` (a hidden/selected form
  // value) alone; confirm server-side that this user is actually a member
  // before writing anything scoped to the group.
  const group = await getGroupForMember(groupId, userId);
  if (!group) {
    return { error: "You are not a member of that group." };
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

  try {
    await createAvailabilitySlotFromLocalTime({ userId, start, end, timeZone, groupId });
  } catch (error) {
    return { error: describeError(error) };
  }

  revalidatePath("/calendar");
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
