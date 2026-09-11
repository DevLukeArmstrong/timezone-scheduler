"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { registerAction, type RegisterActionState } from "@/app/register/actions";
import { TimeZoneSelect } from "@/components/timezone-select";

const initialState: RegisterActionState = {};

export function RegisterForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/login";

  // Guess the visitor's time zone client-side, after mount, so the server
  // render and the client's first paint stay identical — avoiding a
  // hydration mismatch (see TimeZoneSelect's `key` trick below).
  const [guessedTimeZone, setGuessedTimeZone] = useState("UTC");
  useEffect(() => {
    // The browser's timezone is only knowable client-side, after mount —
    // there's no way to derive it during render, so this genuinely needs
    // an effect (see react-hooks/set-state-in-effect's own docs on
    // external-system integration as a valid exception).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuessedTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      {callbackUrl && (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}

      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Set a password to start scheduling your availability.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="inviteCode"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Invite code
        </label>
        <input
          type="text"
          name="inviteCode"
          id="inviteCode"
          required
          autoComplete="off"
          placeholder="Ask whoever invited you"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Email
        </label>
        <input
          type="email"
          name="email"
          id="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="name"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Name (optional)
        </label>
        <input
          type="text"
          name="name"
          id="name"
          placeholder="Ada Lovelace"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Password
        </label>
        <input
          type="password"
          name="password"
          id="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="timezone"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Time zone
        </label>
        {/* `key` forces a remount so the detected time zone (available only
            after mount) actually becomes the selected option — `defaultValue`
            alone only applies on first mount. */}
        <TimeZoneSelect
          key={guessedTimeZone}
          name="timezone"
          defaultValue={guessedTimeZone}
          required
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Already have an account?{" "}
        <Link
          href={loginHref}
          className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
