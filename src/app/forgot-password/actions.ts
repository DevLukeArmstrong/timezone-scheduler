"use server";

import { createPasswordResetToken } from "@/lib/services/password-reset";
import { passwordResetEmail, sendEmail } from "@/lib/email";
import { getRequestOrigin } from "@/lib/redirect";

export interface ForgotPasswordActionState {
  submitted?: boolean;
}

export async function forgotPasswordAction(
  _prevState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const email = String(formData.get("email") ?? "").trim();

  if (email) {
    const result = await createPasswordResetToken(email);
    if (result) {
      const origin = await getRequestOrigin();
      const { subject, html, text } = passwordResetEmail(
        `${origin}/reset-password/${result.token}`,
      );
      await sendEmail({ to: email, subject, html, text });
    }
  }

  // Always the same response, whether or not `email` matched a user — this
  // can't be used to probe which emails are registered.
  return { submitted: true };
}
