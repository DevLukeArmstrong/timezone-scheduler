"use client";

import { useActionState, useState } from "react";
import {
  updatePeakHoursAction,
  type UpdatePeakHoursActionState,
} from "@/app/account/actions";
import { GRID_END_HOUR, GRID_START_HOUR } from "@/lib/calendar";

const initialState: UpdatePeakHoursActionState = {};

const LABEL_CLASSNAME =
  "text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400";
const SELECT_CLASSNAME =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour === GRID_END_HOUR) return "Midnight";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

/** Start options are 12 AM–11 PM; end options are 1 AM–midnight (exclusive bound). */
const START_HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => i + GRID_START_HOUR,
);
const END_HOURS = START_HOURS.map((hour) => hour + 1);

interface AccountPeakHoursFormProps {
  defaultPeakStartHour: number;
  defaultPeakEndHour: number;
}

/**
 * Chooses which hours the week grid renders at full height. Hours outside the
 * band are compressed rather than hidden, so this changes emphasis, never
 * what's visible.
 */
export function AccountPeakHoursForm({
  defaultPeakStartHour,
  defaultPeakEndHour,
}: AccountPeakHoursFormProps) {
  const [state, formAction, pending] = useActionState(
    updatePeakHoursAction,
    initialState,
  );
  // Tracked so the hint below updates as you change the selects; the form
  // still submits them by `name` like any other input.
  const [startHour, setStartHour] = useState(defaultPeakStartHour);
  const [endHour, setEndHour] = useState(defaultPeakEndHour);

  const isValidRange = endHour > startHour;

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Calendar peak hours
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The hours the week grid gives full height to. Quieter hours are
          compressed into a thin strip you can expand — never hidden.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor="peakStartHour" className={LABEL_CLASSNAME}>
            Starts
          </label>
          <select
            id="peakStartHour"
            name="peakStartHour"
            value={startHour}
            onChange={(event) => setStartHour(Number(event.target.value))}
            className={SELECT_CLASSNAME}
          >
            {START_HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {formatHour(hour)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="peakEndHour" className={LABEL_CLASSNAME}>
            Ends
          </label>
          <select
            id="peakEndHour"
            name="peakEndHour"
            value={endHour}
            onChange={(event) => setEndHour(Number(event.target.value))}
            className={SELECT_CLASSNAME}
          >
            {END_HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {formatHour(hour)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        {isValidRange
          ? `${formatHour(startHour)} – ${formatHour(endHour)} at full height; the remaining ${
              GRID_END_HOUR - (endHour - startHour)
            } hours compressed.`
          : "The end time has to be later than the start time."}
      </p>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Peak hours updated.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !isValidRange}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Saving…" : "Save peak hours"}
      </button>
    </form>
  );
}
