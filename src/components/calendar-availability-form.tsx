"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  addCalendarAvailabilitySlotAction,
  type CalendarActionState,
} from "@/app/calendar/actions";
import { TimeZoneSelect } from "@/components/timezone-select";

const initialState: CalendarActionState = {};

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

interface CalendarAvailabilityFormProps {
  groups: { id: string; name: string }[];
  /** Groups pre-checked in the multi-select (typically the calendar filter). */
  defaultGroupIds?: string[];
  defaultTimeZone: string;
}

/**
 * Adds one wall-clock availability window to one or more of the user's
 * groups. Each selected group gets its own slot; successful copies share a
 * batch id so they can be removed together later.
 */
export function CalendarAvailabilityForm({
  groups,
  defaultGroupIds,
  defaultTimeZone,
}: CalendarAvailabilityFormProps) {
  const [state, formAction, pending] = useActionState(
    addCalendarAvailabilitySlotAction,
    initialState,
  );

  if (groups.length === 0) {
    return (
      <div className="space-y-2 rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Add availability
        </h2>
        <p>
          You&apos;re not in any groups yet — availability is always shared
          inside a group. Head to{" "}
          <Link href="/groups" className="font-medium underline">
            Groups
          </Link>{" "}
          to create or join one first.
        </p>
      </div>
    );
  }

  const checkedIds =
    defaultGroupIds && defaultGroupIds.length > 0
      ? new Set(defaultGroupIds)
      : new Set(groups.map((group) => group.id));

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Add availability
      </h2>

      <fieldset className="space-y-1.5">
        <legend className={LABEL_CLASSNAME}>Groups</legend>
        <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
          {groups.map((group) => (
            <label
              key={group.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
            >
              <input
                type="checkbox"
                name="groupIds"
                value={group.id}
                defaultChecked={checkedIds.has(group.id)}
                className="size-3.5 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900"
              />
              <span className="truncate">{group.name}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          One window is copied into each selected group. Overlaps are checked
          per group.
        </p>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="date" className={LABEL_CLASSNAME}>
          Start date
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
            Start time
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
            End time
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
        <label htmlFor="endDate" className={LABEL_CLASSNAME}>
          End date
        </label>
        <input type="date" name="endDate" id="endDate" className={INPUT_CLASSNAME} />
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Leave blank for a same-day slot. Pick a later date for a slot that
          spans midnight (e.g. 5 PM–2 AM).
        </p>
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
