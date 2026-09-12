"use client";

import { createPortal } from "react-dom";
import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { RecurrenceRule } from "@/lib/db";
import {
  updateCalendarAvailabilityRecurringSlotAction,
  updateCalendarAvailabilitySlotAction,
  type CalendarActionState,
} from "@/app/calendar-actions";
import {
  INPUT_CLASSNAME,
  LABEL_CLASSNAME,
  WEEKDAYS,
} from "@/components/calendar-availability-form";
import { WEEKDAY_BITS } from "@/lib/recurrence";
import {
  dateOnlyToLocalDateParts,
  formatLocalDateParts,
  formatMinutesAsTime,
  getLocalDateParts,
  getLocalMinutesSinceMidnight,
  shortTimeZoneLabel,
} from "@/lib/timezone";

const initialState: CalendarActionState = {};

/** Popover width (`w-72` = 18rem) plus a little breathing room, used to keep it on-screen. */
const POPOVER_WIDTH_PX = 296;
/** Below this much room, the popover opens above the trigger instead of below it. */
const MIN_SPACE_BELOW_PX = 360;

interface PopoverCoords {
  left: number;
  placement: "above" | "below";
  y: number;
}

/**
 * Click-toggled floating panel, positioned relative to its trigger and
 * dismissed on an outside click, Escape, or scroll. Unlike the conversion
 * preview popover this one always opens on click (not hover) on every
 * device, since it holds a form rather than read-only text.
 */
function useEditPopover() {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement: PopoverCoords["placement"] =
      spaceBelow < MIN_SPACE_BELOW_PX && rect.top > MIN_SPACE_BELOW_PX ? "above" : "below";
    setCoords({
      left: Math.min(Math.max(rect.left, 8), window.innerWidth - POPOVER_WIDTH_PX - 8),
      placement,
      y: placement === "below" ? rect.bottom + 4 : rect.top - 4,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: Event) {
      if (event.type === "keydown" && (event as KeyboardEvent).key !== "Escape") return;
      if (
        event.type === "mousedown" &&
        (triggerRef.current?.contains(event.target as Node) ||
          panelRef.current?.contains(event.target as Node))
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  return { open, setOpen, coords, triggerRef, panelRef };
}

/** Closes the popover once a pending submit resolves without an error. */
function useCloseOnSuccess(pending: boolean, error: string | undefined, onSuccess: () => void) {
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !error) {
      onSuccess();
    }
    wasPending.current = pending;
  }, [pending, error, onSuccess]);
}

const BUTTON_ROW_CLASSNAME = "flex items-center justify-end gap-2 pt-1";
const CANCEL_BUTTON_CLASSNAME =
  "rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200";
const SAVE_BUTTON_CLASSNAME =
  "rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

interface EditOneOffFormProps {
  slotId: string;
  startUtc: Date;
  endUtc: Date;
  displayTimeZone: string;
  onDone: () => void;
}

/** Edit form for a one-off slot: date and start/end time, in the zone the calendar is displayed in. */
function EditOneOffForm({ slotId, startUtc, endUtc, displayTimeZone, onDone }: EditOneOffFormProps) {
  const [state, formAction, pending] = useActionState(
    updateCalendarAvailabilitySlotAction.bind(null, slotId),
    initialState,
  );
  useCloseOnSuccess(pending, state.error, onDone);

  const defaultDate = formatLocalDateParts(getLocalDateParts(startUtc, displayTimeZone));
  const defaultEndDate = formatLocalDateParts(getLocalDateParts(endUtc, displayTimeZone));
  const defaultStartTime = formatMinutesAsTime(
    getLocalMinutesSinceMidnight(startUtc, displayTimeZone),
  );
  const defaultEndTime = formatMinutesAsTime(getLocalMinutesSinceMidnight(endUtc, displayTimeZone));

  return (
    <form action={formAction} className="space-y-2.5">
      <p className={LABEL_CLASSNAME}>Edit availability</p>

      <div className="space-y-1.5">
        <label htmlFor={`date-${slotId}`} className={LABEL_CLASSNAME}>
          Date
        </label>
        <input
          type="date"
          name="date"
          id={`date-${slotId}`}
          required
          defaultValue={defaultDate}
          className={INPUT_CLASSNAME}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor={`startTime-${slotId}`} className={LABEL_CLASSNAME}>
            Start time
          </label>
          <input
            type="time"
            name="startTime"
            id={`startTime-${slotId}`}
            required
            defaultValue={defaultStartTime}
            className={INPUT_CLASSNAME}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`endTime-${slotId}`} className={LABEL_CLASSNAME}>
            End time
          </label>
          <input
            type="time"
            name="endTime"
            id={`endTime-${slotId}`}
            required
            defaultValue={defaultEndTime}
            className={INPUT_CLASSNAME}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`endDate-${slotId}`} className={LABEL_CLASSNAME}>
          End date
        </label>
        <input
          type="date"
          name="endDate"
          id={`endDate-${slotId}`}
          defaultValue={defaultDate === defaultEndDate ? "" : defaultEndDate}
          className={INPUT_CLASSNAME}
        />
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Leave blank for a same-day slot. Pick a later date for a slot that
          spans midnight.
        </p>
      </div>

      <input type="hidden" name="timeZone" value={displayTimeZone} />
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Times in {shortTimeZoneLabel(displayTimeZone)}.
      </p>

      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}

      <div className={BUTTON_ROW_CLASSNAME}>
        <button type="button" onClick={onDone} className={CANCEL_BUTTON_CLASSNAME}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={SAVE_BUTTON_CLASSNAME}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

interface EditRecurringFormProps {
  slotId: string;
  recurrence: RecurrenceRule;
  onDone: () => void;
}

/**
 * Edit form for a recurring series: daily window, days of week, and date
 * range for the whole series. The rule's own time zone can't be changed
 * here — see {@link updateRecurringAvailabilitySlot}.
 */
function EditRecurringForm({ slotId, recurrence, onDone }: EditRecurringFormProps) {
  const [state, formAction, pending] = useActionState(
    updateCalendarAvailabilityRecurringSlotAction.bind(null, slotId),
    initialState,
  );
  useCloseOnSuccess(pending, state.error, onDone);

  const defaultRangeStart = recurrence.rangeStart
    ? formatLocalDateParts(dateOnlyToLocalDateParts(recurrence.rangeStart))
    : "";
  const defaultRangeEnd = recurrence.rangeEnd
    ? formatLocalDateParts(dateOnlyToLocalDateParts(recurrence.rangeEnd))
    : "";

  return (
    <form action={formAction} className="space-y-2.5">
      <p className={LABEL_CLASSNAME}>Edit series</p>

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
                defaultChecked={
                  recurrence.daysOfWeek == null ||
                  (recurrence.daysOfWeek & WEEKDAY_BITS[day.value]) !== 0
                }
                className="size-3 rounded border-zinc-300"
              />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor={`rangeStart-${slotId}`} className={LABEL_CLASSNAME}>
            Series start
          </label>
          <input
            type="date"
            name="rangeStart"
            id={`rangeStart-${slotId}`}
            defaultValue={defaultRangeStart}
            className={INPUT_CLASSNAME}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`rangeEnd-${slotId}`} className={LABEL_CLASSNAME}>
            Series end
          </label>
          <input
            type="date"
            name="rangeEnd"
            id={`rangeEnd-${slotId}`}
            defaultValue={defaultRangeEnd}
            className={INPUT_CLASSNAME}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor={`startTime-${slotId}`} className={LABEL_CLASSNAME}>
            Daily start
          </label>
          <input
            type="time"
            name="startTime"
            id={`startTime-${slotId}`}
            required
            defaultValue={formatMinutesAsTime(recurrence.startMinute)}
            className={INPUT_CLASSNAME}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`endTime-${slotId}`} className={LABEL_CLASSNAME}>
            Daily end
          </label>
          <input
            type="time"
            name="endTime"
            id={`endTime-${slotId}`}
            required
            defaultValue={formatMinutesAsTime(recurrence.endMinute)}
            className={INPUT_CLASSNAME}
          />
        </div>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Times in {shortTimeZoneLabel(recurrence.timeZone)} — the series&apos;
        zone can&apos;t be changed here. If end is earlier than start, the
        window spans midnight.
      </p>

      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}

      <div className={BUTTON_ROW_CLASSNAME}>
        <button type="button" onClick={onDone} className={CANCEL_BUTTON_CLASSNAME}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={SAVE_BUTTON_CLASSNAME}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

interface EditOccurrenceButtonProps {
  slotId: string;
  isRecurring: boolean;
  startUtc: Date;
  endUtc: Date;
  displayTimeZone: string;
  /** The series' recurrence rule; required when `isRecurring` is true. */
  recurrence: RecurrenceRule | null;
  className: string;
}

/**
 * Small "edit" trigger for one of the viewer's own slots. Opens a floating
 * form — one-off slots edit date/times directly; recurring series edit the
 * whole rule (daily window, days, date range) rather than a single
 * occurrence, since there's no per-occurrence time override in this app.
 */
export function EditOccurrenceButton({
  slotId,
  isRecurring,
  startUtc,
  endUtc,
  displayTimeZone,
  recurrence,
  className,
}: EditOccurrenceButtonProps) {
  const { open, setOpen, coords, triggerRef, panelRef } = useEditPopover();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Edit this availability"
        aria-label="Edit this availability"
        onClick={() => setOpen((value) => !value)}
        className={className}
      >
        ✏️
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.placement === "below" ? coords.y : undefined,
              bottom: coords.placement === "above" ? window.innerHeight - coords.y : undefined,
            }}
            className="z-50 w-72 space-y-1 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            {isRecurring && recurrence ? (
              <EditRecurringForm
                slotId={slotId}
                recurrence={recurrence}
                onDone={() => setOpen(false)}
              />
            ) : (
              <EditOneOffForm
                slotId={slotId}
                startUtc={startUtc}
                endUtc={endUtc}
                displayTimeZone={displayTimeZone}
                onDone={() => setOpen(false)}
              />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
