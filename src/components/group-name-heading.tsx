"use client";

import { useActionState, useState } from "react";
import { renameGroupAction, type GroupMemberActionState } from "@/app/groups/actions";

const initialState: GroupMemberActionState = {};

/**
 * The group's name in `GroupManagementCard`'s header — a plain heading for
 * everyone, or (owner/admin only) one that toggles into an inline rename
 * form. `renameGroup` re-checks the OWNER/ADMIN requirement server-side via
 * `getGroupForAdmin`, so `isAdmin` here only decides whether to render the
 * "Rename" control.
 */
export function GroupNameHeading({
  groupId,
  name,
  isAdmin,
}: {
  groupId: string;
  name: string;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    renameGroupAction.bind(null, groupId),
    initialState,
  );
  // Closes the editor once a submission succeeds. Adjusting state during
  // render (rather than in a useEffect) per React's "you might not need an
  // effect" guidance — `prevState` only tracks whether this specific state
  // object (a fresh one per completed submission) has already been seen.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (!state.error) setEditing(false);
  }

  if (!isAdmin) {
    return (
      <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{name}</h3>
    );
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{name}</h3>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 text-xs text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <form action={formAction} className="flex items-center gap-1.5">
        <input
          type="text"
          name="name"
          defaultValue={name}
          required
          maxLength={60}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 text-xs font-medium text-zinc-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="shrink-0 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Cancel
        </button>
      </form>
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
