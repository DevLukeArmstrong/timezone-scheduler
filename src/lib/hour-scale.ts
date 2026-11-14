import { GRID_END_HOUR, GRID_START_HOUR } from "@/lib/calendar";

/** Row height for hours inside the peak band — sized for a comfortable tap target. */
export const PEAK_ROW_PX = 48;
/** Row height for hours outside it. Compressed, never zero: an off-peak slot
 *  still has to be visible enough to notice and tap. */
export const OFFPEAK_ROW_PX = 10;

export interface HourScale {
  /** Rendered pixel height of the row for `hour`. */
  rowHeight(hour: number): number;
  /** Pixels from the top of a day column to a fractional hour. */
  offsetAt(hour: number): number;
  /** The inverse of {@link offsetAt}: the fractional hour at `px` from the top. */
  hourAt(px: number): number;
  /** Full pixel height of a day column. */
  totalHeight: number;
  isPeak(hour: number): boolean;
}

/**
 * Maps hours to vertical pixels, giving peak hours full height and
 * compressing the rest.
 *
 * The scale is cumulative and strictly increasing, which is the property the
 * whole approach rests on: because every hour still occupies *some* space and
 * hours never reorder, a window that crosses the peak boundary — an 11pm–2am
 * block, say — maps to one continuous run of pixels. It gets squashed as it
 * passes through the compressed region, but it never has to be split into
 * separate blocks or dropped, which is what would be required if off-peak
 * hours were removed from the grid instead of shrunk. Strictly increasing is
 * also what makes it invertible, which is how drag-to-add turns a pointer
 * position back into a time ({@link HourScale.hourAt}).
 *
 * When `expanded` is true every hour is at full height, i.e. the plain
 * uniform grid.
 *
 * Lives here rather than in the grid component because both the server-
 * rendered grid and the client-side drag layer need the exact same pixels —
 * two copies would drift, and a drag would land a few minutes off the line
 * it visibly started on.
 */
export function buildHourScale(
  peakStartHour: number,
  peakEndHour: number,
  expanded: boolean,
): HourScale {
  const isPeak = (hour: number) => hour >= peakStartHour && hour < peakEndHour;
  const rowHeight = (hour: number) =>
    expanded || isPeak(hour) ? PEAK_ROW_PX : OFFPEAK_ROW_PX;

  // offsets[h] is the top of hour h; offsets[24] is the column height.
  const offsets: number[] = [0];
  for (let hour = GRID_START_HOUR; hour < GRID_END_HOUR; hour += 1) {
    offsets.push(offsets[hour] + rowHeight(hour));
  }
  const totalHeight = offsets[GRID_END_HOUR];

  function offsetAt(hour: number): number {
    const clamped = Math.min(Math.max(hour, GRID_START_HOUR), GRID_END_HOUR);
    const whole = Math.floor(clamped);
    if (whole >= GRID_END_HOUR) return totalHeight;
    // Interpolate within the hour's own row, so :30 lands halfway down a row
    // whatever height that row happens to have.
    return offsets[whole] + (clamped - whole) * rowHeight(whole);
  }

  function hourAt(px: number): number {
    if (px <= 0) return GRID_START_HOUR;
    if (px >= totalHeight) return GRID_END_HOUR;
    let hour = GRID_START_HOUR;
    while (hour < GRID_END_HOUR - 1 && offsets[hour + 1] <= px) hour += 1;
    return hour + (px - offsets[hour]) / rowHeight(hour);
  }

  return { rowHeight, offsetAt, hourAt, totalHeight, isPeak };
}

/** Granularity of a drag selection, in minutes. */
export const DRAG_SNAP_MINUTES = 15;
/** How long a bare click (no drag) makes the new window. */
export const CLICK_DEFAULT_MINUTES = 60;
const MINUTES_PER_DAY = 24 * 60;

export interface MinuteRange {
  /** Minutes since local midnight, inclusive. */
  startMinute: number;
  /** Minutes since local midnight, exclusive. 1440 means "until midnight". */
  endMinute: number;
}

/**
 * Turns the two ends of a drag (fractional hours, either order) into a
 * snapped window. It covers every 15-minute cell the pointer touched — the
 * start rounds down and the end rounds up — so dragging from 7:05 to 8:55
 * gives 7:00–9:00, matching what the highlighted rows looked like.
 */
export function rangeFromDrag(anchorHour: number, currentHour: number): MinuteRange {
  const lo = clampMinutes(Math.min(anchorHour, currentHour) * 60);
  const hi = clampMinutes(Math.max(anchorHour, currentHour) * 60);
  let startMinute = Math.floor(lo / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
  let endMinute = Math.ceil(hi / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
  if (endMinute - startMinute < DRAG_SNAP_MINUTES) {
    endMinute = startMinute + DRAG_SNAP_MINUTES;
  }
  if (endMinute > MINUTES_PER_DAY) {
    endMinute = MINUTES_PER_DAY;
    startMinute = MINUTES_PER_DAY - DRAG_SNAP_MINUTES;
  }
  return { startMinute, endMinute };
}

/**
 * The window a bare click makes: an hour from the 15-minute cell that was
 * clicked, cut short at midnight rather than spilling into the next day
 * (a column is one day; crossing into the next is what the form is for).
 */
export function rangeFromClick(hour: number): MinuteRange {
  const minute = clampMinutes(hour * 60);
  const startMinute = Math.min(
    Math.floor(minute / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES,
    MINUTES_PER_DAY - DRAG_SNAP_MINUTES,
  );
  return {
    startMinute,
    endMinute: Math.min(startMinute + CLICK_DEFAULT_MINUTES, MINUTES_PER_DAY),
  };
}

/** "7:00 PM", "12:15 AM"; 1440 reads as midnight ("12:00 AM"). */
export function formatMinutesLabel(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${period}`;
}

function clampMinutes(minutes: number): number {
  return Math.min(Math.max(minutes, 0), MINUTES_PER_DAY);
}
