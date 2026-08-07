"use client";

import { useActionState } from "react";
import { updateNameAction, type UpdateNameActionState } from "@/app/account/actions";

const initialState: UpdateNameActionState = {};

export function AccountNameForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(updateNameAction, initialState);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Name
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Shown to other members in your groups.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="name"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Name
        </label>
        <input
          type="text"
          name="name"
          id="name"
          defaultValue={defaultName}
          placeholder="Ada Lovelace"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Name updated.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}
