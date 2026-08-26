"use server";

import { redirect } from "next/navigation";
import { resetPasswordWithToken } from "@/lib/services/password-reset";
import { ServiceError } from "@/lib/errors";

export interface ResetPasswordActionState {
  error?: string;
}

export async function resetPasswordAction(
  _prevState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }

  try {
    await resetPasswordWithToken(token, newPassword);
  } catch (error) {
    if (error instanceof ServiceError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect("/login?reset=1");
}
