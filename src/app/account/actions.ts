"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  updateNotificationPreferences,
  updateUserName,
  updateUserPassword,
} from "@/lib/services/users";
import { setFavoriteTimeZones } from "@/lib/services/favorite-timezones";
import { ServiceError } from "@/lib/errors";

export interface UpdateNameActionState {
  error?: string;
  success?: boolean;
}

export async function updateNameAction(
  _prevState: UpdateNameActionState,
  formData: FormData,
): Promise<UpdateNameActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "You must be signed in." };
  }

  const name = String(formData.get("name") ?? "");

  try {
    await updateUserName(userId, name);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  // The name is shown in the header avatar/title and to other group
  // members, so revalidate the whole app rather than guessing paths.
  revalidatePath("/", "layout");
  return { success: true };
}

export interface UpdatePasswordActionState {
  error?: string;
  success?: boolean;
}

export async function updatePasswordAction(
  _prevState: UpdatePasswordActionState,
  formData: FormData,
): Promise<UpdatePasswordActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "You must be signed in." };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }

  try {
    await updateUserPassword(userId, currentPassword, newPassword);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  return { success: true };
}

export interface UpdateFavoriteTimeZonesActionState {
  error?: string;
  success?: boolean;
}

export async function updateFavoriteTimeZonesAction(
  _prevState: UpdateFavoriteTimeZonesActionState,
  formData: FormData,
): Promise<UpdateFavoriteTimeZonesActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "You must be signed in." };
  }

  try {
    await setFavoriteTimeZones(userId, formData.getAll("timeZones").map(String));
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  // The calendar's availability form also reads this list, on a different route.
  revalidatePath("/calendar");
  return { success: true };
}

export interface UpdateNotificationPreferencesActionState {
  error?: string;
  success?: boolean;
}

export async function updateNotificationPreferencesAction(
  _prevState: UpdateNotificationPreferencesActionState,
  formData: FormData,
): Promise<UpdateNotificationPreferencesActionState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: "You must be signed in." };
  }

  try {
    // Checked boxes are the only ones present in FormData, so absence means "off".
    await updateNotificationPreferences(userId, {
      notifyReminder: formData.has("notifyReminder"),
      notifyOverlap: formData.has("notifyOverlap"),
      notifyNewAvailability: formData.has("notifyNewAvailability"),
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  return { success: true };
}
