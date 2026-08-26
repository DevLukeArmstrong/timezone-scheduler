import Link from "next/link";
import { isPasswordResetTokenValid } from "@/lib/services/password-reset";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const isValid = await isPasswordResetTokenValid(token);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      {isValid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="w-full max-w-sm space-y-3 rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Link expired
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            This password reset link is invalid or has expired.
          </p>
          <Link
            href="/forgot-password"
            className="inline-block text-sm font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
          >
            Request a new link
          </Link>
        </div>
      )}
    </div>
  );
}
