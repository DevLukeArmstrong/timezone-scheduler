"use client";

import { useActionState } from "react";
import { createGroupAction, type CreateGroupActionState } from "@/app/groups/actions";

const initialState: CreateGroupActionState = {};

export function CreateGroupForm() {
  const [state, formAction, pending] = useActionState(createGroupAction, initialState);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Create a group
      </h2>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="name"
            className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
          >
            Group name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            required
            maxLength={60}
            placeholder="e.g. DND Group"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "Creating…" : "Create"}
        </button>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
