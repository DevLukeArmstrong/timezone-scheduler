"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getUserById } from "@/lib/services/users";
import {
  publishGamerOfTheMonth,
  takeDownGamerOfTheMonth,
  updateGamerOfTheMonth,
} from "@/lib/services/gamer-of-the-month";
import { isSiteAdmin } from "@/lib/site-admin";
import { ServiceError } from "@/lib/errors";

export interface GamerOfTheMonthActionState {
  error?: string;
  success?: string;
}

/**
 * Resolves the acting admin's email from the session. The email is what
 * `isSiteAdmin` keys on, and it's re-read from the database rather than
 * trusted from the JWT so a stale cookie for a deleted account can't act.
 */
async function requireAdminEmail(): Promise<string | null> {
  const session = await auth();
  const user = session?.user?.id ? await getUserById(session.user.id) : null;
  if (!user || !isSiteAdmin(user.email)) return null;
  return user.email;
}

/**
 * One action for both submit buttons on the admin form. The pressed
 * button's `intent` decides whether this is a new month (`publish` — fresh
 * row, everyone sees the popup again) or a fix to the live one (`update` —
 * same id, dismissals kept). The service functions re-check the admin
 * gate themselves; the check here just gives a readable error.
 */
export async function saveGamerOfTheMonthAction(
  _prevState: GamerOfTheMonthActionState,
  formData: FormData,
): Promise<GamerOfTheMonthActionState> {
  const actingEmail = await requireAdminEmail();
  if (!actingEmail) {
    return { error: "You're not allowed to do that." };
  }

  const intent = String(formData.get("intent") ?? "publish");
  const currentId = String(formData.get("currentId") ?? "");
  const input = {
    userId: String(formData.get("userId") ?? ""),
    title: String(formData.get("title") ?? ""),
    blurb: String(formData.get("blurb") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    youtube: String(formData.get("youtube") ?? ""),
  };

  try {
    if (intent === "update" && currentId) {
      await updateGamerOfTheMonth(actingEmail, currentId, input);
    } else {
      await publishGamerOfTheMonth(actingEmail, input);
    }
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  // The popup renders on every signed-in page, not just this one.
  revalidatePath("/", "layout");
  return {
    success:
      intent === "update" && currentId
        ? "Saved. Anyone who already dismissed it won't see it again."
        : "Published. Everyone will see it on their next visit.",
  };
}

export async function takeDownGamerOfTheMonthAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: GamerOfTheMonthActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData,
): Promise<GamerOfTheMonthActionState> {
  const actingEmail = await requireAdminEmail();
  if (!actingEmail) {
    return { error: "You're not allowed to do that." };
  }

  try {
    await takeDownGamerOfTheMonth(actingEmail);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/", "layout");
  return { success: "Taken down. Nobody will see a popup until you publish a new one." };
}
