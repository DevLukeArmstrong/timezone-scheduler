"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { updateUserTimezone } from "@/lib/services/users";

/**
 * Shared, page-agnostic actions used by `AppHeader`, which itself renders
 * on every authenticated page (`/calendar`, `/groups`, ...) — these live
 * here rather than under a specific route's `actions.ts` so the header
 * never has to import from a sibling page's module.
 */

export async function updateTimezoneAction(formData: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!userId || !timezone) return;

  await updateUserTimezone(userId, timezone);
  // The timezone affects rendering on every page (calendar grid, week
  // labels, invite-flow timestamps, ...), so revalidate the whole app
  // rather than guessing which specific paths matter.
  revalidatePath("/", "layout");
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
