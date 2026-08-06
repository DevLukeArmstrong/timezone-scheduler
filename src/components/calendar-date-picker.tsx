"use client";

import { useRouter } from "next/navigation";

interface CalendarDatePickerProps {
  basePath: string;
  defaultValue: string;
  /**
   * Other already-serialized search params to preserve (e.g. `view=` and
   * `groups=`), so jumping to a date never resets the active view or filter.
   */
  extraQuery?: string;
}

/**
 * A native date input that jumps the calendar to the period containing
 * whatever date is picked. Reads the browser-supplied `YYYY-MM-DD` string
 * straight off the input and hands it to the server as `?date=`, so there's
 * no client-side date parsing or arithmetic here — the server component
 * (via `resolveDateReference`) is the only place that interprets it.
 */
export function CalendarDatePicker({
  basePath,
  defaultValue,
  extraQuery,
}: CalendarDatePickerProps) {
  const router = useRouter();

  return (
    <input
      type="date"
      aria-label="Jump to date"
      defaultValue={defaultValue}
      onChange={(event) => {
        const value = event.target.value;
        if (!value) return;
        const href = `${basePath}?date=${value}`;
        router.push(extraQuery ? `${href}&${extraQuery}` : href);
      }}
      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
    />
  );
}
