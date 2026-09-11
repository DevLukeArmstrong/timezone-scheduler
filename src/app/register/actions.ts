"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { createUser } from "@/lib/services/users";
import { ServiceError } from "@/lib/errors";
import { sanitizeRedirectTarget } from "@/lib/redirect";
import { timingSafeEqualString } from "@/lib/timing-safe-equal";

export interface RegisterActionState {
  error?: string;
}

const NO_ERROR: RegisterActionState = {};

/**
 * Checked before any account is created. Existing accounts and sign-in are
 * completely untouched by this — only new registrations are gated, and only
 * here (the seed script's own `createUser` and the lower-level
 * `lib/services/users.createUser` never see this check, so local fixtures
 * keep working without it). No `REGISTRATION_INVITE_CODE` configured means
 * registration is closed, not open — this is a small friend group on a real
 * public domain now, so the safe default is "off" until the admin sets one.
 */
function verifyRegistrationCode(provided: string): boolean {
  const required = process.env.REGISTRATION_INVITE_CODE;
  if (!required) return false;
  return timingSafeEqualString(provided, required);
}

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const timezone = String(formData.get("timezone") ?? "");
  const inviteCode = String(formData.get("inviteCode") ?? "");
  const redirectTo = await sanitizeRedirectTarget(formData.get("callbackUrl"));

  if (!verifyRegistrationCode(inviteCode)) {
    return { error: "That invite code isn't right." };
  }

  try {
    await createUser({ email, password, name, timezone });
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      // Account was created successfully; only the automatic sign-in failed.
      return { error: "Account created — please sign in." };
    }
    throw error;
  }

  return NO_ERROR;
}
