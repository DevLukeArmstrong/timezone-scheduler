"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { createUser } from "@/lib/services/users";
import { ServiceError } from "@/lib/errors";
import { sanitizeRedirectTarget } from "@/lib/redirect";

export interface RegisterActionState {
  error?: string;
}

const NO_ERROR: RegisterActionState = {};

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");
  const timezone = String(formData.get("timezone") ?? "");
  const redirectTo = await sanitizeRedirectTarget(formData.get("callbackUrl"));

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
