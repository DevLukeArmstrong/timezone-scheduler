"use client";

import { useActionState, useState } from "react";
import {
  updateFavoriteTimeZonesAction,
  type UpdateFavoriteTimeZonesActionState,
} from "@/app/account/actions";
import { TimeZoneSelect } from "@/components/timezone-select";

const initialState: UpdateFavoriteTimeZonesActionState = {};

function shortLabel(timeZone: string): string {
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
}

interface AccountTimeZonesFormProps {
  defaultTimeZones: string[];
}

/**
 * Manages the saved zones shown as a live conversion preview on the
 * calendar's "Add availability" form (see calendar-availability-form.tsx).
 * Edits happen entirely in local state; nothing is sent until Save, which
 * submits the whole list — simpler than diffing individual add/remove calls
 * against the server for a list this short.
 */
export function AccountTimeZonesForm({ defaultTimeZones }: AccountTimeZonesFormProps) {
  const [state, formAction, pending] = useActionState(
    updateFavoriteTimeZonesAction,
    initialState,
  );
  const [zones, setZones] = useState(defaultTimeZones);

  function addZone(timeZone: string) {
    if (!timeZone || zones.includes(timeZone)) return;
    setZones((current) => [...current, timeZone]);
  }

  function removeZone(timeZone: string) {
    setZones((current) => current.filter((zone) => zone !== timeZone));
  }

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Favorite time zones
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Shown as a live conversion preview when you add availability, so you
          can tell at a glance whether a time works for everyone.
        </p>
      </div>

      {zones.map((zone) => (
        <input key={zone} type="hidden" name="timeZones" value={zone} />
      ))}

      <ul className="space-y-1.5">
        {zones.length === 0 && (
          <li className="rounded-lg border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-400 dark:border-zinc-700">
            No favorite time zones — add some below.
          </li>
        )}
        {zones.map((zone) => (
          <li
            key={zone}
            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            <span className="truncate text-zinc-800 dark:text-zinc-200">
              {shortLabel(zone)}
              <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">{zone}</span>
            </span>
            <button
              type="button"
              onClick={() => removeZone(zone)}
              className="shrink-0 text-xs font-medium text-zinc-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-1.5">
        <label
          htmlFor="add-timezone"
          className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Add a time zone
        </label>
        <TimeZoneSelect
          key={zones.length}
          name="__addTimeZone"
          id="add-timezone"
          onChange={addZone}
        />
      </div>

      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state.success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Favorite time zones updated.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Save favorite time zones"}
      </button>
    </form>
  );
}
