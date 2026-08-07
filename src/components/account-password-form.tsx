"use client";

import { useActionState, useState } from "react";
import { updatePasswordAction, type UpdatePasswordActionState } from "@/app/account/actions";

const initialState: UpdatePasswordActionState = {};

export function AccountPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, initialState);

  // On success, remount the form (via `key`) so the password fields —
  // uncontrolled inputs — clear instead of holding the just-submitted
  // values. Adjusted during render rather than in an effect, per React's
  // guidance for resetting state in response to a prop/value change.
  const [resetKey, setResetKey] = useState(0);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.success) {
      setResetKey((key) => key + 1);
    }
  }

  return (
    <form
      key={resetKey}
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Password
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Choose a new password for your account.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="currentPassword"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Current password
        </label>
        <input
          type="password"
          name="currentPassword"
          id="currentPassword"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="newPassword"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          New password
        </label>
        <input
          type="password"
          name="newPassword"
          id="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="confirmPassword"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Confirm new password
        </label>
        <input
          type="password"
          name="confirmPassword"
          id="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Password updated.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
