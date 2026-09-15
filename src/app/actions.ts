"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { updateUserTimezone } from "@/lib/services/users";
import { dismissGamerOfTheMonth } from "@/lib/services/gamer-of-the-month";

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

/**
 * "Don't show this again this month" on the gamer-of-the-month popup. The
 * popup renders on more than one page, and the dismissal is stored on the
 * `User` row those pages all load, so revalidate the whole app: after this
 * no page should render it again for this user.
 */
export async function dismissGamerOfTheMonthAction(featureId: string): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || typeof featureId !== "string" || !featureId) return;

  await dismissGamerOfTheMonth(userId, featureId);
  revalidatePath("/", "layout");
}
