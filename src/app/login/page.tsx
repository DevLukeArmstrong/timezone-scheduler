import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reset?: string; stale?: string }>;
}) {
  const { callbackUrl, reset, stale } = await searchParams;

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 p-6 dark:bg-zinc-950">
      {reset && (
        <p className="w-full max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
          Password updated — sign in with your new password.
        </p>
      )}
      {stale && !reset && (
        <p className="w-full max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
          Your session is no longer valid — please sign in again.
        </p>
      )}
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}
