import { addDays, startOfWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";
import type { AvailabilitySlot } from "@/lib/db";
import type { GroupAvailabilitySlot } from "@/lib/services/availability";
import { assertValidTimeZone, utcToWallClock } from "@/lib/timezone";

export const GRID_START_HOUR = 8;
export const GRID_END_HOUR = 20;
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const GRID_SPAN_HOURS = GRID_END_HOUR - GRID_START_HOUR;
const MS_PER_HOUR = 1000 * 60 * 60;

/** The Monday–Sunday week containing `reference`, expressed as local midnights in `timeZone`. */
export function getWeekDays(
  timeZone: string,
  reference: Date = new Date(),
): TZDate[] {
  assertValidTimeZone(timeZone);
  const now = TZDate.tz(timeZone, reference.getTime());
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i) as TZDate);
}

export interface PositionedSlot {
  slot: AvailabilitySlot;
  dayIndex: number;
  topPercent: number;
  heightPercent: number;
  label: string;
}

/**
 * Projects UTC-stored slots onto a 7-day grid in `timeZone`, clipped to the
 * `[GRID_START_HOUR, GRID_END_HOUR)` window each day. A slot that spans
 * midnight (or several days) contributes one entry per day it touches.
 */
export function layoutSlotsForWeek(
  slots: AvailabilitySlot[],
  timeZone: string,
  weekDays: Date[],
): PositionedSlot[] {
  const positioned: PositionedSlot[] = [];

  for (const slot of slots) {
    const localStart = utcToWallClock(slot.startTime, timeZone);
    const localEnd = utcToWallClock(slot.endTime, timeZone);
    const label = formatTimeRange(localStart, localEnd, timeZone);

    weekDays.forEach((dayStart, dayIndex) => {
      const dayEnd = addDays(dayStart, 1);
      if (localStart >= dayEnd || localEnd <= dayStart) return;

      const startHour = Math.max(
        GRID_START_HOUR,
        hoursSinceMidnight(localStart < dayStart ? dayStart : localStart, dayStart),
      );
      const endHour = Math.min(
        GRID_END_HOUR,
        hoursSinceMidnight(localEnd > dayEnd ? dayEnd : localEnd, dayStart),
      );
      if (endHour <= startHour) return;

      positioned.push({
        slot,
        dayIndex,
        topPercent: ((startHour - GRID_START_HOUR) / GRID_SPAN_HOURS) * 100,
        heightPercent: ((endHour - startHour) / GRID_SPAN_HOURS) * 100,
        label,
      });
    });
  }

  return positioned;
}

export interface PositionedGroupSlot {
  slot: GroupAvailabilitySlot;
  dayIndex: number;
  topPercent: number;
  heightPercent: number;
  label: string;
  /** 0-based column this slot renders in, among others that overlap it in time on the same day. */
  lane: number;
  /** Total number of side-by-side columns needed on that day for this cluster of overlapping slots. */
  laneCount: number;
}

/**
 * Like `layoutSlotsForWeek`, but for many members' slots at once: slots
 * that overlap in time on the same day are placed in side-by-side lanes
 * (via greedy interval coloring) instead of stacking on top of each other,
 * so every member's availability stays visible and clickable.
 */
export function layoutGroupSlotsForWeek(
  slots: GroupAvailabilitySlot[],
  timeZone: string,
  weekDays: Date[],
): PositionedGroupSlot[] {
  type Clipped = Omit<PositionedGroupSlot, "lane" | "laneCount">;
  const clipped: Clipped[] = [];

  for (const slot of slots) {
    const localStart = utcToWallClock(slot.startTime, timeZone);
    const localEnd = utcToWallClock(slot.endTime, timeZone);
    const label = formatTimeRange(localStart, localEnd, timeZone);

    weekDays.forEach((dayStart, dayIndex) => {
      const dayEnd = addDays(dayStart, 1);
      if (localStart >= dayEnd || localEnd <= dayStart) return;

      const startHour = Math.max(
        GRID_START_HOUR,
        hoursSinceMidnight(localStart < dayStart ? dayStart : localStart, dayStart),
      );
      const endHour = Math.min(
        GRID_END_HOUR,
        hoursSinceMidnight(localEnd > dayEnd ? dayEnd : localEnd, dayStart),
      );
      if (endHour <= startHour) return;

      clipped.push({
        slot,
        dayIndex,
        topPercent: ((startHour - GRID_START_HOUR) / GRID_SPAN_HOURS) * 100,
        heightPercent: ((endHour - startHour) / GRID_SPAN_HOURS) * 100,
        label,
      });
    });
  }

  const byDay = new Map<number, Clipped[]>();
  for (const entry of clipped) {
    const list = byDay.get(entry.dayIndex);
    if (list) {
      list.push(entry);
    } else {
      byDay.set(entry.dayIndex, [entry]);
    }
  }

  const positioned: PositionedGroupSlot[] = [];
  for (const entries of byDay.values()) {
    entries.sort((a, b) => a.topPercent - b.topPercent);

    // Greedy interval-graph coloring: each slot takes the lowest-numbered
    // lane whose most recent occupant has already ended.
    const laneEndPercents: number[] = [];
    const withLanes = entries.map((entry) => {
      const entryEndPercent = entry.topPercent + entry.heightPercent;
      let lane = laneEndPercents.findIndex((end) => end <= entry.topPercent);
      if (lane === -1) {
        lane = laneEndPercents.length;
        laneEndPercents.push(entryEndPercent);
      } else {
        laneEndPercents[lane] = entryEndPercent;
      }
      return { entry, lane };
    });

    const laneCount = laneEndPercents.length;
    for (const { entry, lane } of withLanes) {
      positioned.push({ ...entry, lane, laneCount });
    }
  }

  return positioned;
}

function hoursSinceMidnight(date: Date, dayStart: Date): number {
  return (date.getTime() - dayStart.getTime()) / MS_PER_HOUR;
}

function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}
