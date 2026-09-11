import { describe, expect, it } from "vitest";
import { getWeekDays, layoutOverlapWindowsForWeek } from "@/lib/calendar";
import type { OverlapWindow } from "@/lib/overlap";

// Monday 7 Sep 2026 through Sunday 13 Sep, in a zone with no DST shift in
// that window so the wall clock and UTC agree.
const WEEK_DAYS = getWeekDays("UTC", new Date("2026-09-09T12:00:00Z"));
const t = (hhmm: string, day: number) =>
  new Date(`2026-09-${String(day).padStart(2, "0")}T${hhmm}:00Z`);

function window(
  freeCount: number,
  start: string,
  end: string,
  day: number,
  groupId = "g1",
  quorumThreshold = 3,
): OverlapWindow {
  return {
    groupId,
    groupName: groupId,
    memberIds: ["a", "b", "c", "d", "e"].slice(0, freeCount),
    startTime: t(start, day),
    endTime: t(end, day),
    freeCount,
    quorumThreshold,
    meetsQuorum: freeCount >= quorumThreshold,
  };
}

const shape = (bands: ReturnType<typeof layoutOverlapWindowsForWeek>) =>
  bands.map((band) => [band.dayIndex, band.startHour, band.endHour, band.window.freeCount]);

describe("layoutOverlapWindowsForWeek", () => {
  it("places a window on its day as fractional hours", () => {
    const bands = layoutOverlapWindowsForWeek(
      [window(3, "19:00", "21:30", 11)],
      "UTC",
      WEEK_DAYS,
    );
    expect(shape(bands)).toEqual([[4, 19, 21.5, 3]]);
  });

  it("splits a window that crosses local midnight across both days", () => {
    const bands = layoutOverlapWindowsForWeek(
      [
        {
          ...window(3, "22:00", "23:00", 11),
          endTime: t("01:00", 12),
        },
      ],
      "UTC",
      WEEK_DAYS,
    );
    expect(shape(bands)).toEqual([
      [4, 22, 24, 3],
      [5, 0, 1, 3],
    ]);
  });

  it("re-days a window in the viewer's zone, not UTC", () => {
    // 19:00Z Friday is 07:00 Saturday in Auckland.
    const bands = layoutOverlapWindowsForWeek(
      [window(3, "19:00", "22:00", 11)],
      "Pacific/Auckland",
      getWeekDays("Pacific/Auckland", new Date("2026-09-09T12:00:00Z")),
    );
    expect(shape(bands)).toEqual([[5, 7, 10, 3]]);
  });

  it("leaves a single group's disjoint windows exactly as they are", () => {
    const bands = layoutOverlapWindowsForWeek(
      [
        window(2, "19:00", "20:00", 11),
        window(4, "20:00", "21:00", 11),
        window(2, "21:00", "22:00", 11),
      ],
      "UTC",
      WEEK_DAYS,
    );
    expect(shape(bands)).toEqual([
      [4, 19, 20, 2],
      [4, 20, 21, 4],
      [4, 21, 22, 2],
    ]);
  });

  it("gives a contested minute to the group with more people free", () => {
    const bands = layoutOverlapWindowsForWeek(
      [
        window(2, "19:00", "22:00", 11, "g1"),
        window(4, "20:00", "21:00", 11, "g2"),
      ],
      "UTC",
      WEEK_DAYS,
    );
    expect(shape(bands)).toEqual([
      [4, 19, 20, 2],
      [4, 20, 21, 4],
      [4, 21, 22, 2],
    ]);
    expect(bands.map((band) => band.window.groupId)).toEqual(["g1", "g2", "g1"]);
  });

  it("re-merges the slices either side of a shorter, denser band", () => {
    // Two identical-headcount neighbours must not be welded together, but one
    // window cut in half by another group's must come back as two pieces of
    // itself, not a run of slivers.
    const long = window(2, "19:00", "23:00", 11, "g1");
    const bands = layoutOverlapWindowsForWeek(
      [long, window(4, "20:00", "20:30", 11, "g2"), window(4, "21:00", "21:30", 11, "g2")],
      "UTC",
      WEEK_DAYS,
    );
    expect(shape(bands)).toEqual([
      [4, 19, 20, 2],
      [4, 20, 20.5, 4],
      [4, 20.5, 21, 2],
      [4, 21, 21.5, 4],
      [4, 21.5, 23, 2],
    ]);
  });

  it("drops a window that falls outside the visible week", () => {
    expect(
      layoutOverlapWindowsForWeek([window(3, "19:00", "22:00", 20)], "UTC", WEEK_DAYS),
    ).toEqual([]);
  });
});
