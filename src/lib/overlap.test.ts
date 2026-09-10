import { describe, expect, it } from "vitest";
import {
  computeOverlapWindows,
  formatOverlapWindowLabel,
  maxFreeCount,
  rankBestTimes,
  type OverlapGroup,
} from "@/lib/overlap";
import { findQuorumWindows, type MemberWindow } from "@/lib/quorum";
import type { AvailabilityOccurrence } from "@/lib/services/availability";

// All times are UTC in the week of Mon 7 Sep 2026; "19:00" reads as
// 2026-09-11T19:00Z on day 11 (a Friday).
const t = (hhmm: string, day = 11) =>
  new Date(`2026-09-${String(day).padStart(2, "0")}T${hhmm}:00Z`);
const HORIZON = { start: t("00:00", 7), end: t("00:00", 14) };

const GROUP: OverlapGroup = {
  id: "g1",
  name: "Friday Gaming",
  quorumThreshold: 3,
  memberIds: ["a", "b", "c", "d"],
};

/**
 * The fields the overlap computation actually reads. The rest of a real
 * `AvailabilityOccurrence` is Prisma-shaped scaffolding this never touches.
 */
function occurrence(
  userId: string,
  start: string,
  end: string,
  day = 11,
  groupId = "g1",
): AvailabilityOccurrence {
  return {
    slotId: `${userId}-${start}-${day}`,
    occurrenceKey: `${userId}-${start}-${day}`,
    occurrenceDate: null,
    startTime: t(start, day),
    endTime: t(end, day),
    batchId: null,
    isRecurring: false,
    user: { id: userId },
    group: { id: groupId },
    recurrence: null,
  } as unknown as AvailabilityOccurrence;
}

describe("computeOverlapWindows", () => {
  it("counts how many members are free in each constant-membership span", () => {
    const windows = computeOverlapWindows(
      [
        occurrence("a", "19:00", "22:00"),
        occurrence("b", "19:00", "22:00"),
        occurrence("c", "20:00", "21:00"),
      ],
      [GROUP],
      HORIZON,
    );

    expect(
      windows.map((w) => [w.startTime.toISOString(), w.freeCount, w.meetsQuorum]),
    ).toEqual([
      ["2026-09-11T19:00:00.000Z", 2, false],
      ["2026-09-11T20:00:00.000Z", 3, true],
      ["2026-09-11T21:00:00.000Z", 2, false],
    ]);
  });

  it("keeps a lone member's availability as a one-person span", () => {
    const windows = computeOverlapWindows(
      [occurrence("a", "19:00", "22:00")],
      [GROUP],
      HORIZON,
    );
    expect(windows).toHaveLength(1);
    expect(windows[0].freeCount).toBe(1);
    expect(windows[0].meetsQuorum).toBe(false);
  });

  it("ignores slots left behind by someone who is no longer a member", () => {
    const windows = computeOverlapWindows(
      [
        occurrence("a", "19:00", "22:00"),
        occurrence("b", "19:00", "22:00"),
        occurrence("gone", "19:00", "22:00"),
      ],
      [GROUP],
      HORIZON,
    );
    expect(windows).toHaveLength(1);
    expect(windows[0].memberIds).toEqual(["a", "b"]);
  });

  it("keeps each group's windows separate, against its own threshold", () => {
    const groups: OverlapGroup[] = [
      GROUP,
      { id: "g2", name: "Book Club", quorumThreshold: 2, memberIds: ["a", "b"] },
    ];
    const windows = computeOverlapWindows(
      [
        occurrence("a", "19:00", "22:00", 11, "g1"),
        occurrence("b", "19:00", "22:00", 11, "g1"),
        occurrence("a", "19:00", "22:00", 11, "g2"),
        occurrence("b", "19:00", "22:00", 11, "g2"),
      ],
      groups,
      HORIZON,
    );

    // Same two people, same hours — but two of four is short of Friday
    // Gaming's threshold and exactly Book Club's.
    expect(windows.map((w) => [w.groupId, w.freeCount, w.meetsQuorum])).toEqual([
      ["g1", 2, false],
      ["g2", 2, true],
    ]);
  });

  it("clips to the horizon rather than reporting overlap outside the visible week", () => {
    const windows = computeOverlapWindows(
      [
        occurrence("a", "22:00", "23:59", 13),
        occurrence("b", "22:00", "23:59", 13),
        occurrence("c", "22:00", "23:59", 13),
      ],
      [GROUP],
      { start: t("00:00", 7), end: t("23:00", 13) },
    );
    expect(windows).toHaveLength(1);
    expect(windows[0].endTime.toISOString()).toBe("2026-09-13T23:00:00.000Z");
  });

  it("counts a member with two overlapping slots once", () => {
    const windows = computeOverlapWindows(
      [
        occurrence("a", "19:00", "22:00"),
        occurrence("a", "20:00", "21:00"),
        occurrence("b", "19:00", "22:00"),
      ],
      [GROUP],
      HORIZON,
    );
    expect(windows.every((w) => w.freeCount === 2)).toBe(true);
  });
});

/**
 * The whole point of routing the grid through `findQuorumWindows`: if these
 * ever diverge, the calendar and the Discord post are telling the group
 * different things about the same evening, and nobody would notice.
 */
describe("agreement with the Discord quorum path", () => {
  const occurrences = [
    occurrence("a", "18:00", "23:00"),
    occurrence("b", "19:00", "22:00"),
    occurrence("c", "19:00", "22:00"),
    occurrence("d", "20:30", "21:00"),
    occurrence("a", "09:00", "17:00", 12),
    occurrence("b", "09:00", "17:00", 12),
    occurrence("c", "12:00", "13:00", 12),
  ];

  it("produces exactly the windows the alert would post, for every threshold", () => {
    const memberWindows: MemberWindow[] = occurrences.map((o) => ({
      userId: o.user.id,
      startTime: o.startTime,
      endTime: o.endTime,
    }));

    for (const quorumThreshold of [2, 3, 4]) {
      const fromGrid = computeOverlapWindows(
        occurrences,
        [{ ...GROUP, quorumThreshold }],
        HORIZON,
      )
        .filter((w) => w.meetsQuorum)
        .map((w) => ({
          memberIds: w.memberIds,
          startTime: w.startTime,
          endTime: w.endTime,
        }));

      const fromAlert = findQuorumWindows(memberWindows, quorumThreshold, HORIZON);

      expect(fromGrid).toEqual(fromAlert);
    }
  });
});

describe("rankBestTimes", () => {
  const window = (
    freeCount: number,
    start: string,
    end: string,
    day = 11,
  ) => ({
    groupId: "g1",
    groupName: "Friday Gaming",
    memberIds: ["a", "b", "c", "d", "e"].slice(0, freeCount),
    startTime: t(start, day),
    endTime: t(end, day),
    freeCount,
    quorumThreshold: 3,
    meetsQuorum: freeCount >= 3,
  });

  it("ranks by headcount, then duration, then earliest", () => {
    const ranked = rankBestTimes([
      window(3, "09:00", "10:00", 8),
      window(4, "19:00", "20:00"),
      window(4, "13:00", "17:00", 9),
      window(2, "08:00", "12:00", 7),
    ]);
    expect(ranked.map((w) => [w.freeCount, w.startTime.toISOString()])).toEqual([
      [4, "2026-09-09T13:00:00.000Z"],
      [4, "2026-09-11T19:00:00.000Z"],
      [3, "2026-09-08T09:00:00.000Z"],
      [2, "2026-09-07T08:00:00.000Z"],
    ]);
  });

  it("drops slivers too short to propose and spans with only one person free", () => {
    const ranked = rankBestTimes([
      window(5, "19:00", "19:10"),
      window(1, "09:00", "17:00"),
      window(2, "20:00", "20:30"),
    ]);
    expect(ranked.map((w) => w.freeCount)).toEqual([2]);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      window(3, `${String(i + 8).padStart(2, "0")}:00`, `${String(i + 9).padStart(2, "0")}:00`),
    );
    expect(rankBestTimes(many)).toHaveLength(5);
    expect(rankBestTimes(many, 3)).toHaveLength(3);
  });

  it("reports the densest overlap for the heat scale", () => {
    expect(maxFreeCount([window(2, "19:00", "20:00"), window(5, "20:00", "21:00")])).toBe(5);
    expect(maxFreeCount([])).toBe(0);
  });
});

describe("formatOverlapWindowLabel", () => {
  const label = (start: string, end: string, timeZone: string, day = 11) =>
    formatOverlapWindowLabel({ startTime: t(start, day), endTime: t(end, day) }, timeZone);

  it("drops the repeated meridiem and the empty minutes", () => {
    expect(label("19:00", "22:00", "UTC")).toBe("Fri 7–10pm");
  });

  it("keeps minutes and both meridiems when they differ", () => {
    expect(label("11:30", "13:00", "UTC")).toBe("Fri 11:30am–1pm");
  });

  it("names both days when the window crosses midnight locally", () => {
    expect(label("23:00", "23:59", "UTC")).toBe("Fri 11–11:59pm");
    expect(
      formatOverlapWindowLabel(
        { startTime: t("23:00"), endTime: t("01:00", 12) },
        "UTC",
      ),
    ).toBe("Fri 11pm – Sat 1am");
  });

  it("labels in the viewer's zone, not UTC", () => {
    // 19:00Z on Friday is Saturday morning in Auckland (UTC+12).
    expect(label("19:00", "22:00", "Pacific/Auckland")).toBe("Sat 7–10am");
  });
});
