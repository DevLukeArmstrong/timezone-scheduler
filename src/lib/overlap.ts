/**
 * "Where does everyone's availability actually overlap?" — the calendar's
 * view of the same thing the Discord quorum alert posts about.
 *
 * This module deliberately owns **no** overlap arithmetic of its own. Every
 * window here comes out of {@link findQuorumWindows}, the exact sweep-line
 * `src/lib/services/quorum.ts` runs before posting to a channel. If the grid
 * and the Discord post ever disagreed about who is free when, nobody would
 * ever find the bug — so there is only one implementation, and this is a
 * caller of it, not a copy.
 *
 * The one trick: `findQuorumWindows` takes the threshold as a parameter, so
 * calling it with `DENSITY_THRESHOLD` (1) yields *every* maximal span with a
 * constant set of free members — one person, two, all of them. That is
 * exactly the density the heat layer needs, and `freeCount >= quorumThreshold`
 * then re-derives "this one would have been posted" from the same spans.
 */

import { MIN_QUORUM_THRESHOLD, findQuorumWindows, type MemberWindow } from "@/lib/quorum";
import type { AvailabilityOccurrence } from "@/lib/services/availability";
import { utcToWallClock } from "@/lib/timezone";

/**
 * Threshold passed to {@link findQuorumWindows} when enumerating spans for
 * the heat layer: one free member is still a span worth knowing the shape of,
 * even though it is nobody's idea of a quorum.
 */
const DENSITY_THRESHOLD = 1;

/**
 * Shortest span the "best times" list will suggest. A ten-minute five-person
 * sliver is real — the grid still shades it — but proposing it as the week's
 * best time to meet would be silly.
 */
export const MIN_BEST_TIME_MINUTES = 30;

/** How many rows the "best times" list shows. */
export const BEST_TIMES_LIMIT = 5;

/** One group's quorum inputs: its threshold and who currently belongs to it. */
export interface OverlapGroup {
  id: string;
  name: string;
  /** `Group.quorumThreshold` — the same number the Discord alert tests against. */
  quorumThreshold: number;
  /** Current members only; a departed member's leftover slots can't make a quorum. */
  memberIds: string[];
}

/** A span during which a fixed set of one group's members are all free. */
export interface OverlapWindow {
  groupId: string;
  groupName: string;
  /** Sorted, unique — straight from {@link findQuorumWindows}. */
  memberIds: string[];
  startTime: Date;
  endTime: Date;
  freeCount: number;
  quorumThreshold: number;
  /** True when this window is one the group's Discord alert would post about. */
  meetsQuorum: boolean;
}

/**
 * Every constant-membership span inside `horizon`, computed **per group**
 * against that group's own threshold and membership.
 *
 * Per group rather than pooled across the selected groups on purpose: the
 * threshold is a property of a group, and someone in two groups is one human
 * but two separate quorum contributions. Pooling would produce a count with
 * no threshold to test it against, and a band on the grid that contradicts
 * every Discord post. Every window returned here is a real window in exactly
 * one group.
 *
 * Mirrors `evaluateGroupQuorum`'s inputs: occurrences already expanded for
 * the visible window, narrowed to current members. The only difference is
 * the horizon — a week on screen versus a fortnight of lookahead — so a
 * window straddling the week's edge is clipped at the edge here and isn't
 * there. That is inherent to drawing a week; it is not a second opinion
 * about who is free.
 */
export function computeOverlapWindows(
  occurrences: AvailabilityOccurrence[],
  groups: OverlapGroup[],
  horizon: { start: Date; end: Date },
): OverlapWindow[] {
  const result: OverlapWindow[] = [];

  for (const group of groups) {
    const members = new Set(group.memberIds);
    const windows: MemberWindow[] = occurrences
      .filter(
        (occurrence) =>
          occurrence.group.id === group.id && members.has(occurrence.user.id),
      )
      .map((occurrence) => ({
        userId: occurrence.user.id,
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
      }));

    for (const window of findQuorumWindows(windows, DENSITY_THRESHOLD, horizon)) {
      result.push({
        groupId: group.id,
        groupName: group.name,
        memberIds: window.memberIds,
        startTime: window.startTime,
        endTime: window.endTime,
        freeCount: window.memberIds.length,
        quorumThreshold: group.quorumThreshold,
        meetsQuorum: window.memberIds.length >= group.quorumThreshold,
      });
    }
  }

  return result;
}

/**
 * The week's most promising windows: most people first, then longest, then
 * earliest. Windows shorter than {@link MIN_BEST_TIME_MINUTES} and windows
 * with fewer than {@link MIN_QUORUM_THRESHOLD} people are dropped — one
 * person free is availability, not an overlap.
 *
 * Adjacent spans with different member sets stay separate rows (7–9pm four
 * free, 9–10pm three free) rather than merging into one blurred range. That
 * is how the Discord message lists them, and merging would have to invent a
 * headcount that is true of neither half.
 */
export function rankBestTimes(
  windows: OverlapWindow[],
  limit: number = BEST_TIMES_LIMIT,
): OverlapWindow[] {
  return windows
    .filter(
      (window) =>
        window.freeCount >= MIN_QUORUM_THRESHOLD &&
        durationMinutes(window) >= MIN_BEST_TIME_MINUTES,
    )
    .sort(
      (a, b) =>
        b.freeCount - a.freeCount ||
        durationMinutes(b) - durationMinutes(a) ||
        a.startTime.getTime() - b.startTime.getTime(),
    )
    .slice(0, limit);
}

/** Largest number of people free at once across `windows`; 0 when there are none. */
export function maxFreeCount(windows: OverlapWindow[]): number {
  return windows.reduce((max, window) => Math.max(max, window.freeCount), 0);
}

export function durationMinutes(window: { startTime: Date; endTime: Date }): number {
  return (window.endTime.getTime() - window.startTime.getTime()) / 60000;
}

/**
 * Compact, human range in `timeZone`: `Fri 7–10pm`, `Sat 11:30am–1pm`,
 * `Fri 11pm – Sat 1am`. The meridiem is dropped from the start when it
 * matches the end, and `:00` is dropped throughout, because "Fri 7:00 PM –
 * 10:00 PM" is four extra glyphs saying nothing.
 */
export function formatOverlapWindowLabel(
  window: { startTime: Date; endTime: Date },
  timeZone: string,
): string {
  const start = utcToWallClock(window.startTime, timeZone);
  const end = utcToWallClock(window.endTime, timeZone);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  const startDay = weekdayLabel(start);
  const startTime = clockLabel(start);
  const endTime = clockLabel(end);

  if (!sameDay) {
    return `${startDay} ${startTime}${meridiem(start)} – ${weekdayLabel(end)} ${endTime}${meridiem(end)}`;
  }

  // Same half of the day ("7–10pm"); otherwise both need spelling out.
  const startMeridiem = meridiem(start) === meridiem(end) ? "" : meridiem(start);
  return `${startDay} ${startTime}${startMeridiem}–${endTime}${meridiem(end)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayLabel(local: Date): string {
  return WEEKDAYS[local.getDay()];
}

function clockLabel(local: Date): string {
  const hour = local.getHours() % 12 === 0 ? 12 : local.getHours() % 12;
  const minute = local.getMinutes();
  return minute === 0 ? `${hour}` : `${hour}:${String(minute).padStart(2, "0")}`;
}

function meridiem(local: Date): string {
  return local.getHours() >= 12 ? "pm" : "am";
}
