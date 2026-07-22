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

export interface GroupActionState {
  error?: string;
}

const NO_ERROR: GroupActionState = {};

export async function addGroupAvailabilitySlotAction(
  groupId: string,
  _prevState: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "Please sign in before adding availability." };
  }

  // Authorization gate — never trust `groupId` (bound client-side) alone;
  // confirm server-side that this user is actually a member before writing
  // anything scoped to the group.
  const group = await getGroupForMember(groupId, userId);
  if (!group) {
    return { error: "You are not a member of this group." };
  }

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const timeZone = String(formData.get("timeZone") ?? "").trim() || undefined;

  const start = parseDateAndTime(date, startTime);
  const end = parseDateAndTime(date, endTime);
  if (!start || !end) {
    return { error: "Please provide a valid date and start/end time." };
  }

  try {
    await createAvailabilitySlotFromLocalTime({ userId, start, end, timeZone, groupId });
  } catch (error) {
    return { error: describeError(error) };
  }

  revalidatePath(`/groups/${groupId}`);
  return NO_ERROR;
}

/**
 * Deletes one of the *current user's own* slots inside a group.
 * `deleteAvailabilitySlot` scopes the delete to `(slotId, userId)`, so this
 * can never remove another member's slot even if `slotId` is guessed or a
 * request is forged directly — the ownership check happens server-side,
 * not just by hiding the delete control in the UI.
 */
export async function deleteGroupAvailabilitySlotAction(
  groupId: string,
  slotId: string,
): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;

  await deleteAvailabilitySlot(userId, slotId);
  revalidatePath(`/groups/${groupId}`);
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
