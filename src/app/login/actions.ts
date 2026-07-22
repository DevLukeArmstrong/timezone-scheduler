"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { sanitizeRedirectTarget } from "@/lib/redirect";

export interface LoginActionState {
  error?: string;
}

const NO_ERROR: LoginActionState = {};

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const redirectTo = await sanitizeRedirectTarget(formData.get("callbackUrl"));

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo,
    });
  } catch (error) {
    // `signIn`'s redirect-on-success also throws (it's how Next.js performs
    // server-side navigation), so only report *actual* auth failures here and
    // let every other throw — including that redirect — propagate normally.
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  return NO_ERROR;
}
