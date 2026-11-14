"use client";

import { createPortal } from "react-dom";
import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  addCalendarAvailabilitySlotAction,
  type CalendarActionState,
} from "@/app/calendar-actions";
import {
  INPUT_CLASSNAME,
  LABEL_CLASSNAME,
} from "@/components/calendar-availability-form";
import {
  buildHourScale,
  formatMinutesLabel,
  rangeFromClick,
  rangeFromDrag,
  type MinuteRange,
} from "@/lib/hour-scale";
import { formatMinutesAsTime, parseTimeToMinutes } from "@/lib/timezone";

/** A mouse has to travel this far (px) before a press counts as a drag rather than a click. */
const MOUSE_DRAG_THRESHOLD_PX = 4;
/** How long a finger must rest before a touch turns into a drag instead of a scroll. */
const LONG_PRESS_MS = 400;
/** A finger that wanders further than this before the long press fires is scrolling. */
const LONG_PRESS_SLOP_PX = 10;
const POPOVER_WIDTH_PX = 288;

/** Anything a press on should keep its own meaning: the viewer's own blocks, links, forms. */
const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label, form";

interface Gesture {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  anchorHour: number;
  /** True once the press is a drag (mouse moved, or the long press fired). */
  dragging: boolean;
  /** Pressed on someone else's block: a plain click there opens their preview, not a new slot. */
  onBlock: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | null;
}

interface Selection extends MinuteRange {
  /** Bumped per selection so the popover's form state starts clean each time. */
  id: number;
}

export interface DragToAddGroup {
  id: string;
  name: string;
}

interface DragToAddColumnProps {
  dayIndex: number;
  className: string;
  style: CSSProperties;
  children: ReactNode;
  /** Same three inputs the server grid builds its scale from, so pixels agree exactly. */
  peakStartHour: number;
  peakEndHour: number;
  expandedHours: boolean;
  /** This column's local date (YYYY-MM-DD) in `timeZone`, and the day after it. */
  dateKey: string;
  nextDateKey: string;
  /** "mon" … "sun" — what "repeat weekly" sends as the series' day. */
  weekdayValue: string;
  /** "Monday, Nov 16", for the popover heading. */
  dayLabel: string;
  /** "Mondays", for the repeat checkbox. */
  weekdayPlural: string;
  /** The calendar's display zone; a dragged window is a wall-clock window in it. */
  timeZone: string;
  /** Every group the viewer is in. Empty means there is nowhere to add to, so dragging is off. */
  groups: DragToAddGroup[];
  /** Groups pre-ticked in the popover — the calendar's current filter. */
  defaultGroupIds: string[];
}

/**
 * One day column of the week grid that you can click or drag on to add
 * availability. The server still renders everything inside it (rows, overlap
 * shading, blocks); this only adds the gesture, the highlighted selection,
 * and a small confirm popover that posts to the same server action as the
 * sidebar form — so overlap checks, multi-group copies, and the Discord
 * "is free" post all behave exactly as they do there.
 *
 * - Mouse: press on an empty part of a day and drag; release to confirm.
 *   A plain click makes a one-hour window.
 * - Touch: a plain swipe still scrolls the page. Press and hold, then drag.
 */
export function DragToAddColumn({
  dayIndex,
  className,
  style,
  children,
  peakStartHour,
  peakEndHour,
  expandedHours,
  dateKey,
  nextDateKey,
  weekdayValue,
  dayLabel,
  weekdayPlural,
  timeZone,
  groups,
  defaultGroupIds,
}: DragToAddColumnProps) {
  const enabled = groups.length > 0;
  const scale = useMemo(
    () => buildHourScale(peakStartHour, peakEndHour, expandedHours),
    [peakStartHour, peakEndHour, expandedHours],
  );
  const columnRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const nextIdRef = useRef(1);
  // `live` is the in-progress drag; `selection` is the one waiting in the popover.
  const [live, setLive] = useState<MinuteRange | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  function hourAtClientY(clientY: number): number {
    const rect = columnRef.current?.getBoundingClientRect();
    return rect ? scale.hourAt(clientY - rect.top) : 0;
  }

  function endGesture() {
    const gesture = gestureRef.current;
    if (gesture?.longPressTimer) clearTimeout(gesture.longPressTimer);
    gestureRef.current = null;
  }

  function startDragging(gesture: Gesture, currentHour: number) {
    gesture.dragging = true;
    setSelection(null);
    setLive(rangeFromDrag(gesture.anchorHour, currentHour));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || !event.isPrimary || event.button !== 0) return;
    const target = event.target as HTMLElement;
    // React bubbles events through portals by component tree, not DOM tree,
    // so presses inside the popover (portaled to <body>) arrive here too.
    if (!columnRef.current?.contains(target)) return;
    if (target.closest(INTERACTIVE_SELECTOR)) return;

    endGesture();
    const gesture: Gesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      anchorHour: hourAtClientY(event.clientY),
      dragging: false,
      onBlock: target.closest("[data-calendar-block]") !== null,
      longPressTimer: null,
    };
    gestureRef.current = gesture;

    if (event.pointerType === "mouse") {
      // Keeps the drag tracking even when the pointer leaves the column, and
      // stops the browser starting a text selection under it.
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    } else {
      gesture.longPressTimer = setTimeout(() => {
        gesture.longPressTimer = null;
        if (gestureRef.current !== gesture) return;
        // A little haptic "you've grabbed it" on Android. Chrome refuses
        // (and logs) vibrate before the page has had a real tap, so ask first.
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(10);
        startDragging(gesture, gesture.anchorHour);
      }, LONG_PRESS_MS);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);

    if (!gesture.dragging) {
      if (gesture.pointerType === "mouse") {
        if (distance >= MOUSE_DRAG_THRESHOLD_PX) {
          startDragging(gesture, hourAtClientY(event.clientY));
        }
      } else if (distance > LONG_PRESS_SLOP_PX) {
        // Moved before the long press fired: this is a scroll, not ours.
        endGesture();
      }
      return;
    }
    setLive(rangeFromDrag(gesture.anchorHour, hourAtClientY(event.clientY)));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    endGesture();

    let range: MinuteRange | null = null;
    if (gesture.dragging) {
      range = rangeFromDrag(gesture.anchorHour, hourAtClientY(event.clientY));
    } else if (gesture.pointerType === "mouse" && !gesture.onBlock) {
      // A bare click on empty grid. (A bare tap on a phone does nothing —
      // taps there are mostly people scrolling or closing something.)
      range = rangeFromClick(gesture.anchorHour);
    }
    setLive(null);
    if (range) {
      setSelection({ ...range, id: nextIdRef.current++ });
    }
  }

  function handlePointerCancel() {
    endGesture();
    setLive(null);
  }

  // Once a touch drag is under way, stop the page scrolling under the finger.
  // `touch-action` can't do this — it's read when the touch starts, before
  // we know it's a long press — and React's touch handlers are passive, so
  // this has to be a native, non-passive listener.
  useEffect(() => {
    const column = columnRef.current;
    if (!column || !enabled) return;
    function blockScroll(event: TouchEvent) {
      if (gestureRef.current?.dragging && event.cancelable) event.preventDefault();
    }
    column.addEventListener("touchmove", blockScroll, { passive: false });
    return () => column.removeEventListener("touchmove", blockScroll);
  }, [enabled]);

  useEffect(() => endGesture, []);

  const shown = live ?? selection;

  return (
    <div
      ref={columnRef}
      data-day-index={dayIndex}
      style={enabled ? { ...style, WebkitTouchCallout: "none" } : style}
      className={`${className} ${enabled ? "cursor-crosshair select-none" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(event) => {
        // Android raises the context menu on a long press — the very gesture
        // that starts a touch drag.
        if (gestureRef.current && columnRef.current?.contains(event.target as Node)) {
          event.preventDefault();
        }
      }}
    >
      {children}

      {shown && (
        <div
          aria-hidden
          style={{
            top: `${scale.offsetAt(shown.startMinute / 60)}px`,
            height: `${Math.max(
              6,
              scale.offsetAt(shown.endMinute / 60) - scale.offsetAt(shown.startMinute / 60),
            )}px`,
          }}
          className="pointer-events-none absolute inset-x-0.5 z-20 overflow-hidden rounded-md border-2 border-dashed border-brand-600 bg-brand-400/25 px-1 text-[11px] font-semibold leading-4 text-brand-900 dark:border-brand-300 dark:bg-brand-400/20 dark:text-brand-100"
        >
          {formatMinutesLabel(shown.startMinute)} – {formatMinutesLabel(shown.endMinute)}
        </div>
      )}

      {selection && (
        <AddSelectionPopover
          key={selection.id}
          selection={selection}
          anchorRef={columnRef}
          anchorTopPx={scale.offsetAt(selection.startMinute / 60)}
          anchorBottomPx={scale.offsetAt(selection.endMinute / 60)}
          dateKey={dateKey}
          nextDateKey={nextDateKey}
          weekdayValue={weekdayValue}
          dayLabel={dayLabel}
          weekdayPlural={weekdayPlural}
          timeZone={timeZone}
          groups={groups}
          defaultGroupIds={defaultGroupIds}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  );
}

const initialState: CalendarActionState = {};

interface AddSelectionPopoverProps {
  selection: Selection;
  /** The day column the selection sits in. */
  anchorRef: RefObject<HTMLDivElement | null>;
  /** Selection top/bottom, in px from the top of the anchor column. */
  anchorTopPx: number;
  anchorBottomPx: number;
  dateKey: string;
  nextDateKey: string;
  weekdayValue: string;
  dayLabel: string;
  weekdayPlural: string;
  timeZone: string;
  groups: DragToAddGroup[];
  defaultGroupIds: string[];
  onClose: () => void;
}

/**
 * The confirm step after a drag. Prefilled from the selection but editable,
 * since snapping in the compressed off-peak rows is coarse. Positioned in
 * page coordinates (not `fixed`) so it scrolls with the grid, which also
 * means a phone keyboard opening for the time fields doesn't dismiss it.
 */
function AddSelectionPopover({
  selection,
  anchorRef,
  anchorTopPx,
  anchorBottomPx,
  dateKey,
  nextDateKey,
  weekdayValue,
  dayLabel,
  weekdayPlural,
  timeZone,
  groups,
  defaultGroupIds,
  onClose,
}: AddSelectionPopoverProps) {
  const [state, formAction, pending] = useActionState(
    addCalendarAvailabilitySlotAction,
    initialState,
  );
  const [startTime, setStartTime] = useState(formatMinutesAsTime(selection.startMinute));
  const [endTime, setEndTime] = useState(formatMinutesAsTime(selection.endMinute % 1440));
  const [repeat, setRepeat] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !panelRef.current) return;
    const rect = anchor.getBoundingClientRect();
    const panelHeight = panelRef.current.offsetHeight;
    const viewportWidth = document.documentElement.clientWidth;
    const below = rect.top + anchorBottomPx + 6;
    // Flip above the selection when there's no room under it on screen.
    const top =
      below + panelHeight > window.innerHeight && rect.top + anchorTopPx - panelHeight - 6 > 0
        ? rect.top + anchorTopPx - panelHeight - 6
        : below;
    // Beside a day column if it fits, else centred under it, always on screen.
    const preferred =
      rect.right + 8 + POPOVER_WIDTH_PX <= viewportWidth
        ? rect.right + 8
        : rect.left + rect.width / 2 - POPOVER_WIDTH_PX / 2;
    const left = Math.min(Math.max(preferred, 8), viewportWidth - POPOVER_WIDTH_PX - 8);
    setCoords({ left: left + window.scrollX, top: top + window.scrollY });
    submitRef.current?.focus({ preventScroll: true });
  }, [anchorRef, anchorTopPx, anchorBottomPx]);

  // Close once a submit comes back clean; the server action has already
  // revalidated the page, so the new block is on its way in.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) onClose();
    wasPending.current = pending;
  }, [pending, state.error, onClose]);

  useEffect(() => {
    function dismiss(event: Event) {
      if (event.type === "keydown") {
        if ((event as KeyboardEvent).key === "Escape") onClose();
        return;
      }
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [onClose]);

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  // Same rule as the sidebar form: an end at or before the start means the
  // window runs past midnight — which is how a drag to the bottom of the
  // column (end 24:00, sent as 00:00) gets saved.
  const spansMidnight =
    startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes;
  const checkedIds = new Set(
    defaultGroupIds.length > 0 ? defaultGroupIds : groups.map((group) => group.id),
  );

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add availability"
      style={{
        left: coords?.left ?? 0,
        top: coords?.top ?? 0,
        width: POPOVER_WIDTH_PX,
        visibility: coords ? "visible" : "hidden",
      }}
      className="absolute z-50 rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <form action={formAction} className="space-y-2.5">
        <div>
          <p className={LABEL_CLASSNAME}>Add availability</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {dayLabel}
          </p>
        </div>

        <input type="hidden" name="mode" value={repeat ? "recurring" : "one-off"} />
        <input type="hidden" name="timeZone" value={timeZone} />
        {repeat ? (
          <>
            <input type="hidden" name="daysOfWeek" value={weekdayValue} />
            <input type="hidden" name="rangeStart" value={dateKey} />
          </>
        ) : (
          <>
            <input type="hidden" name="date" value={dateKey} />
            <input type="hidden" name="endDate" value={spansMidnight ? nextDateKey : ""} />
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor={`drag-start-${selection.id}`} className={LABEL_CLASSNAME}>
              From
            </label>
            <input
              type="time"
              name="startTime"
              id={`drag-start-${selection.id}`}
              required
              step={900}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className={INPUT_CLASSNAME}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`drag-end-${selection.id}`} className={LABEL_CLASSNAME}>
              To
            </label>
            <input
              type="time"
              name="endTime"
              id={`drag-end-${selection.id}`}
              required
              step={900}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className={INPUT_CLASSNAME}
            />
          </div>
        </div>
        {spansMidnight && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Runs past midnight into the next day.
          </p>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(event) => setRepeat(event.target.checked)}
            className="size-3.5 rounded border-zinc-300 accent-brand-700"
          />
          Repeat every week on {weekdayPlural}
        </label>

        {groups.length === 1 ? (
          <input type="hidden" name="groupIds" value={groups[0].id} />
        ) : (
          <fieldset className="space-y-1">
            <legend className={LABEL_CLASSNAME}>Groups</legend>
            <div className="max-h-28 space-y-1 overflow-y-auto">
              {groups.map((group) => (
                <label
                  key={group.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200"
                >
                  <input
                    type="checkbox"
                    name="groupIds"
                    value={group.id}
                    defaultChecked={checkedIds.has(group.id)}
                    className="size-3.5 shrink-0 rounded border-zinc-300 accent-brand-700"
                  />
                  <span className="truncate">{group.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            ref={submitRef}
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60 dark:bg-brand-400 dark:text-brand-950 dark:hover:bg-brand-300"
          >
            {pending ? "Saving…" : "Add"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
