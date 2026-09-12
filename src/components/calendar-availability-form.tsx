"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  addCalendarAvailabilitySlotAction,
  type CalendarActionState,
} from "@/app/calendar-actions";
import { TimeZoneSelect } from "@/components/timezone-select";
import {
  addLocalDays,
  formatTimeZoneConversions,
  isValidTimeZone,
  localDateAndMinutesToUtc,
  parseLocalDateString,
  parseTimeToMinutes,
  shortTimeZoneLabel,
} from "@/lib/timezone";

const initialState: CalendarActionState = {};

const INPUT_CLASSNAME =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const LABEL_CLASSNAME =
  "text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400";

const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

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
  /** From Account settings — shown as a live conversion preview below the time zone field. */
  favoriteTimeZones: string[];
}

/**
 * Adds one wall-clock availability window — one-off or recurring — to one or
 * more of the user's groups. Each selected group gets its own slot; successful
 * copies share a batch id so they can be removed together later.
 */
export function CalendarAvailabilityForm({
  groups,
  defaultGroupIds,
  defaultTimeZone,
  favoriteTimeZones,
}: CalendarAvailabilityFormProps) {
  const [state, formAction, pending] = useActionState(
    addCalendarAvailabilitySlotAction,
    initialState,
  );
  const [mode, setMode] = useState<"one-off" | "recurring">("one-off");

  // Tracked (rather than left as uncontrolled defaultValue inputs) purely to
  // drive the conversion preview below — the form still submits these by
  // `name` like any other input.
  const [date, setDate] = useState(todayIso());
  const [rangeStart, setRangeStart] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [timeZone, setTimeZone] = useState(defaultTimeZone);

  const anchorDateStr = mode === "recurring" ? rangeStart || date : date;

  const conversions = useMemo(() => {
    if (favoriteTimeZones.length === 0 || !isValidTimeZone(timeZone)) return [];
    const dateParts = parseLocalDateString(anchorDateStr);
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (!dateParts || startMinutes === null || endMinutes === null) return [];

    const startUtc = localDateAndMinutesToUtc(dateParts, startMinutes, timeZone);
    // Same "earlier end time means it spans midnight" rule the form's own
    // helper text describes — good enough for a preview, even though the
    // actual submission may also consult an explicit end date.
    const endDateParts =
      endMinutes <= startMinutes ? addLocalDays(dateParts, 1, timeZone) : dateParts;
    const endUtc = localDateAndMinutesToUtc(endDateParts, endMinutes, timeZone);

    return formatTimeZoneConversions(startUtc, endUtc, favoriteTimeZones, timeZone);
  }, [anchorDateStr, startTime, endTime, timeZone, favoriteTimeZones]);

  if (groups.length === 0) {
    return (
      <div
        id="add-availability"
        className="space-y-2 rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
      >
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
      id="add-availability"
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

      <fieldset className="space-y-1.5">
        <legend className={LABEL_CLASSNAME}>Type</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-200 px-2 py-2 text-sm dark:border-zinc-700">
            <input
              type="radio"
              name="mode"
              value="one-off"
              checked={mode === "one-off"}
              onChange={() => setMode("one-off")}
            />
            One-off
          </label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-200 px-2 py-2 text-sm dark:border-zinc-700">
            <input
              type="radio"
              name="mode"
              value="recurring"
              checked={mode === "recurring"}
              onChange={() => setMode("recurring")}
            />
            Recurring
          </label>
        </div>
      </fieldset>

      {mode === "one-off" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="date" className={LABEL_CLASSNAME}>
              Start date
            </label>
            <input
              type="date"
              name="date"
              id="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
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
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
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
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
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
        </>
      ) : (
        <>
          <fieldset className="space-y-1.5">
            <legend className={LABEL_CLASSNAME}>Days of week</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => (
                <label
                  key={day.value}
                  className="flex cursor-pointer items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
                >
                  <input
                    type="checkbox"
                    name="daysOfWeek"
                    value={day.value}
                    defaultChecked={day.value !== "sat" && day.value !== "sun"}
                    className="size-3 rounded border-zinc-300"
                  />
                  {day.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Optional if you set a date range. Leave unchecked for every day
              in the range.
            </p>
          </fieldset>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label htmlFor="rangeStart" className={LABEL_CLASSNAME}>
                Series start
              </label>
              <input
                type="date"
                name="rangeStart"
                id="rangeStart"
                value={rangeStart}
                onChange={(event) => setRangeStart(event.target.value)}
                className={INPUT_CLASSNAME}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rangeEnd" className={LABEL_CLASSNAME}>
                Series end
              </label>
              <input
                type="date"
                name="rangeEnd"
                id="rangeEnd"
                className={INPUT_CLASSNAME}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Optional if you pick days of week. Inclusive bounds; leave blank
            for an open-ended series.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label htmlFor="startTimeRecurring" className={LABEL_CLASSNAME}>
                Daily start
              </label>
              <input
                type="time"
                name="startTime"
                id="startTimeRecurring"
                required
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className={INPUT_CLASSNAME}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="endTimeRecurring" className={LABEL_CLASSNAME}>
                Daily end
              </label>
              <input
                type="time"
                name="endTime"
                id="endTimeRecurring"
                required
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className={INPUT_CLASSNAME}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            If end is earlier than start (e.g. 17:00–02:00), the window spans
            midnight.
          </p>
        </>
      )}

      <div className="space-y-1.5">
        <label htmlFor="timeZone" className={LABEL_CLASSNAME}>
          Time zone
        </label>
        <TimeZoneSelect
          name="timeZone"
          defaultValue={defaultTimeZone}
          onChange={setTimeZone}
          required
        />
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Times above are interpreted in this zone, then stored as UTC.
        </p>
      </div>

      {favoriteTimeZones.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Add{" "}
          <Link href="/account" className="font-medium underline">
            favorite time zones
          </Link>{" "}
          to see what this converts to for them.
        </p>
      ) : (
        <div className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
          <p className={LABEL_CLASSNAME}>Converts to</p>
          {conversions.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Fill in a date and times above to see conversions.
            </p>
          ) : (
            <ul className="space-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
              {conversions.map(({ zone, range }) => (
                <li key={zone} className="flex justify-between gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400">{shortTimeZoneLabel(zone)}</span>
                  <span className="font-medium">{range}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
