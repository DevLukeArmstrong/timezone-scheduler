"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { updateUserTimezone } from "@/lib/services/users";
import {
  createAvailabilitySlotFromLocalTime,
  deleteAvailabilitySlot,
} from "@/lib/services/availability";
import type { WallClockTime } from "@/lib/timezone";
import { ServiceError } from "@/lib/errors";

export interface ActionState {
  error?: string;
}

const NO_ERROR: ActionState = {};

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function addAvailabilitySlotAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  if (!userId) {
    return { error: "Please sign in before adding availability." };
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
    await createAvailabilitySlotFromLocalTime({ userId, start, end, timeZone });
  } catch (error) {
    return { error: describeError(error) };
  }

  revalidatePath("/dashboard");
  return NO_ERROR;
}

export async function deleteAvailabilitySlotAction(slotId: string): Promise<void> {
  const userId = await requireUserId();
  if (!userId) return;

  await deleteAvailabilitySlot(userId, slotId);
  revalidatePath("/dashboard");
}

export async function updateTimezoneAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!userId || !timezone) return;

  await updateUserTimezone(userId, timezone);
  revalidatePath("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
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
