"use client";

import { useActionState } from "react";
import {
  addGroupAvailabilitySlotAction,
  type GroupActionState,
} from "@/app/groups/[groupId]/actions";
import { TimeZoneSelect } from "@/components/timezone-select";

const initialState: GroupActionState = {};

const INPUT_CLASSNAME =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const LABEL_CLASSNAME =
  "text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function GroupAvailabilityForm({
  groupId,
  defaultTimeZone,
}: {
  groupId: string;
  defaultTimeZone: string;
}) {
  const [state, formAction, pending] = useActionState(
    addGroupAvailabilitySlotAction.bind(null, groupId),
    initialState,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Add your availability
      </h2>

      <div className="space-y-1.5">
        <label htmlFor="date" className={LABEL_CLASSNAME}>
          Date
        </label>
        <input
          type="date"
          name="date"
          id="date"
          required
          defaultValue={todayIso()}
          className={INPUT_CLASSNAME}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor="startTime" className={LABEL_CLASSNAME}>
            Start
          </label>
          <input
            type="time"
            name="startTime"
            id="startTime"
            required
            defaultValue="09:00"
            className={INPUT_CLASSNAME}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="endTime" className={LABEL_CLASSNAME}>
            End
          </label>
          <input
            type="time"
            name="endTime"
            id="endTime"
            required
            defaultValue="17:00"
            className={INPUT_CLASSNAME}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="timeZone" className={LABEL_CLASSNAME}>
          Time zone
        </label>
        <TimeZoneSelect name="timeZone" defaultValue={defaultTimeZone} required />
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Times above are interpreted in this zone, then stored as UTC.
        </p>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Add availability"}
      </button>
    </form>
  );
}
