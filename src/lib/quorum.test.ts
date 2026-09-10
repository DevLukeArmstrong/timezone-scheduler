import { describe, expect, it } from "vitest";
import {
  findQuorumWindows,
  isSameQuorum,
  reconcileQuorumWindows,
  type MemberWindow,
  type QuorumWindow,
  type StoredQuorumAlert,
} from "@/lib/quorum";

// All times are UTC on Friday 11 Sep 2026; "19:00" reads as 2026-09-11T19:00Z.
const t = (hhmm: string, day = 11) => new Date(`2026-09-${String(day).padStart(2, "0")}T${hhmm}:00Z`);
const free = (userId: string, start: string, end: string, day = 11): MemberWindow => ({
  userId,
  startTime: t(start, day),
  endTime: t(end, day),
});
const HORIZON = { start: t("00:00", 10), end: t("00:00", 25) };

const window = (memberIds: string[], start: string, end: string, day = 11): QuorumWindow => ({
  memberIds: [...memberIds].sort(),
  startTime: t(start, day),
  endTime: t(end, day),
});
const stored = (
  id: string,
  memberIds: string[],
  start: string,
  end: string,
  everyone = false,
): StoredQuorumAlert => ({ id, memberIds: [...memberIds].sort(), startTime: t(start), endTime: t(end), everyone });

describe("findQuorumWindows", () => {
  it("finds the span where four people are all free", () => {
    const windows = [
      free("a", "19:00", "22:00"),
      free("b", "19:00", "22:00"),
      free("c", "18:00", "23:00"),
      free("d", "19:00", "22:00"),
    ];
    expect(findQuorumWindows(windows, 3, HORIZON)).toEqual([
      window(["a", "b", "c", "d"], "19:00", "22:00"),
    ]);
  });

  it("splits into separate spans when the set of free members changes", () => {
    const windows = [
      free("a", "19:00", "22:00"),
      free("b", "19:00", "22:00"),
      free("c", "19:00", "22:00"),
      free("d", "19:00", "21:00"), // leaves an hour early
    ];
    expect(findQuorumWindows(windows, 3, HORIZON)).toEqual([
      window(["a", "b", "c", "d"], "19:00", "21:00"),
      window(["a", "b", "c"], "21:00", "22:00"),
    ]);
  });

  it("ignores spans below the threshold and back-to-back windows", () => {
    const windows = [
      free("a", "19:00", "20:00"),
      free("b", "19:00", "20:00"),
      free("c", "20:00", "21:00"), // starts exactly when a and b end
    ];
    expect(findQuorumWindows(windows, 3, HORIZON)).toEqual([]);
    expect(findQuorumWindows(windows, 2, HORIZON)).toEqual([window(["a", "b"], "19:00", "20:00")]);
  });

  it("clips to the horizon and drops windows outside it", () => {
    const windows = [
      // Runs past the horizon end (midnight starting the 25th).
      { userId: "a", startTime: t("23:00", 24), endTime: t("02:00", 25) },
      { userId: "b", startTime: t("23:00", 24), endTime: t("02:00", 25) },
      free("a", "19:00", "22:00", 30), // beyond the horizon entirely
      free("b", "19:00", "22:00", 30),
    ];
    expect(findQuorumWindows(windows, 2, HORIZON)).toEqual([
      { memberIds: ["a", "b"], startTime: t("23:00", 24), endTime: t("00:00", 25) },
    ]);
  });

  it("counts a member once even when two of their own windows overlap", () => {
    const windows = [
      free("a", "19:00", "22:00"),
      free("a", "20:00", "21:00"), // e.g. a one-off inside a recurring series
      free("b", "19:00", "22:00"),
    ];
    expect(findQuorumWindows(windows, 2, HORIZON)).toEqual([window(["a", "b"], "19:00", "22:00")]);
  });
});

describe("isSameQuorum", () => {
  const alert = stored("x", ["a", "b", "c", "d"], "19:00", "22:00");

  it("matches a window nudged by fifteen minutes", () => {
    expect(isSameQuorum(window(["a", "b", "c", "d"], "19:15", "22:15"), alert, 3)).toBe(true);
  });

  it("matches when one member swapped out, as long as N are still shared", () => {
    expect(isSameQuorum(window(["a", "b", "c", "e"], "19:00", "22:00"), alert, 3)).toBe(true);
    expect(isSameQuorum(window(["a", "b", "e", "f"], "19:00", "22:00"), alert, 3)).toBe(false);
  });

  it("does not match a window that merely touches, or is on another day", () => {
    expect(isSameQuorum(window(["a", "b", "c", "d"], "22:00", "23:00"), alert, 3)).toBe(false);
    expect(isSameQuorum(window(["a", "b", "c", "d"], "19:00", "22:00", 12), alert, 3)).toBe(false);
  });
});

describe("reconcileQuorumWindows", () => {
  const FOUR = ["a", "b", "c", "d"];
  const MEMBERS = 5;

  it("posts a quorum the first time it appears", () => {
    const w = window(FOUR, "19:00", "22:00");
    const result = reconcileQuorumWindows([w], [], 3, MEMBERS);
    expect(result).toEqual({ post: [w], upgrade: [], update: [] });
  });

  it("stays silent when someone nudges a slot by fifteen minutes", () => {
    const alert = stored("x", FOUR, "19:00", "22:00");
    const nudged = window(FOUR, "19:15", "22:00");
    const result = reconcileQuorumWindows([nudged], [alert], 3, MEMBERS);
    expect(result.post).toEqual([]);
    expect(result.upgrade).toEqual([]);
    expect(result.update).toEqual([{ alertId: "x", window: nudged }]);
  });

  it("stays silent across a nudge that also shrinks the set below the original", () => {
    // d deleted their 19–22 and re-added 20–22: the set for 19–20 is now
    // {a,b,c} and for 20–22 it's {a,b,c,d}. Both overlap the old alert and
    // share ≥ 3 members with it, so both are claimed — no post.
    const alert = stored("x", FOUR, "19:00", "22:00");
    const segments = [window(["a", "b", "c"], "19:00", "20:00"), window(FOUR, "20:00", "22:00")];
    const result = reconcileQuorumWindows(segments, [alert], 3, MEMBERS);
    expect(result.post).toEqual([]);
    expect(result.update).toEqual([{ alertId: "x", window: window(FOUR, "19:00", "22:00") }]);
  });

  it("leaves a stored alert alone when its quorum has temporarily collapsed", () => {
    // Someone deleted their slot; evaluation ran; nothing qualifies now.
    const alert = stored("x", FOUR, "19:00", "22:00");
    const result = reconcileQuorumWindows([], [alert], 3, MEMBERS);
    expect(result).toEqual({ post: [], upgrade: [], update: [] });
  });

  it("does not re-post when the same members are re-added hours later", () => {
    // …and then the slot comes back. The alert survived the collapse
    // (it is only pruned once its endTime passes), so it claims the window.
    const alert = stored("x", FOUR, "19:00", "22:00");
    const reAdded = window(FOUR, "19:30", "22:30");
    const result = reconcileQuorumWindows([reAdded], [alert], 3, MEMBERS);
    expect(result.post).toEqual([]);
    expect(result.update).toEqual([{ alertId: "x", window: reAdded }]);
  });

  it("posts a genuinely new quorum on another day while updating the known one", () => {
    const alert = stored("x", FOUR, "19:00", "22:00");
    const friday = window(FOUR, "19:00", "22:00");
    const saturday = window(FOUR, "19:00", "22:00", 12);
    const result = reconcileQuorumWindows([friday, saturday], [alert], 3, MEMBERS);
    expect(result.post).toEqual([saturday]);
    expect(result.update).toEqual([{ alertId: "x", window: friday }]);
  });

  it("stays silent when the quorum grows but not to everyone", () => {
    const alert = stored("x", ["a", "b", "c"], "19:00", "22:00");
    const grown = window(FOUR, "19:00", "22:00");
    const result = reconcileQuorumWindows([grown], [alert], 3, MEMBERS);
    expect(result.post).toEqual([]);
    expect(result.upgrade).toEqual([]);
    expect(result.update).toEqual([{ alertId: "x", window: grown }]);
  });

  it("posts one upgrade when the quorum reaches every member, then never again", () => {
    const alert = stored("x", FOUR, "19:00", "22:00");
    const everyone = window([...FOUR, "e"], "19:00", "21:00");
    const first = reconcileQuorumWindows([everyone], [alert], 3, MEMBERS);
    expect(first.post).toEqual([]);
    expect(first.upgrade).toEqual([{ alertId: "x", window: everyone }]);
    expect(first.update).toEqual([{ alertId: "x", window: everyone }]);

    const marked = { ...alert, everyone: true };
    const second = reconcileQuorumWindows([everyone], [marked], 3, MEMBERS);
    expect(second.upgrade).toEqual([]);
    expect(second.post).toEqual([]);
  });

  it("describes the upgrade by the span everyone shares, not the merged span", () => {
    const alert = stored("x", FOUR, "19:00", "22:00");
    const segments = [window([...FOUR, "e"], "19:00", "20:00"), window(FOUR, "20:00", "22:00")];
    const result = reconcileQuorumWindows(segments, [alert], 3, MEMBERS);
    expect(result.upgrade).toEqual([{ alertId: "x", window: segments[0] }]);
    expect(result.update).toEqual([
      { alertId: "x", window: window([...FOUR, "e"], "19:00", "22:00") },
    ]);
  });

  it("treats a window shared with fewer than N of the stored members as new", () => {
    const alert = stored("x", ["a", "b", "c"], "19:00", "22:00");
    const different = window(["a", "d", "e"], "19:00", "22:00");
    const result = reconcileQuorumWindows([different], [alert], 3, MEMBERS);
    expect(result.post).toEqual([different]);
    expect(result.update).toEqual([]);
  });
});
