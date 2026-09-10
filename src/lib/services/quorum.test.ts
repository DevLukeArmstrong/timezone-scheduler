import { describe, expect, it } from "vitest";
import { quorumAlertMessage } from "@/lib/services/quorum";

const start = new Date("2026-09-11T07:00:00Z");
const end = new Date("2026-09-11T10:00:00Z");

describe("quorumAlertMessage", () => {
  it("lists one window with everyone named", () => {
    const message = quorumAlertMessage("Friday Gaming", [
      { memberIds: ["a", "b", "c", "d"], startTime: start, endTime: end, everyone: false, named: ["Luke", "Alex", "Sam", "Jo"] },
    ]);
    expect(message).toBe(
      "🎉 **Free together** · *Friday Gaming*\n" +
        "• **4 of you** — <t:1789110000:F> – <t:1789120800:t>: Luke, Alex, Sam, and Jo\n" +
        "<http://localhost:3000>",
    );
  });

  it("says 'All N of you' for a full-group window and counts opted-out members", () => {
    const message = quorumAlertMessage("G", [
      { memberIds: ["a", "b", "c"], startTime: start, endTime: end, everyone: true, named: ["Luke"] },
    ]);
    expect(message).toContain("• **All 3 of you** — <t:1789110000:F> – <t:1789120800:t>: Luke and 2 others");
  });

  it("puts several windows on separate lines", () => {
    const later = new Date("2026-09-12T07:00:00Z");
    const message = quorumAlertMessage("G", [
      { memberIds: ["a", "b", "c"], startTime: start, endTime: end, everyone: false, named: ["A", "B", "C"] },
      { memberIds: ["a", "b", "d"], startTime: later, endTime: later, everyone: false, named: ["A", "B"] },
    ]);
    expect(message.split("\n")).toHaveLength(4);
    expect(message).toContain(": A, B, and 1 other");
  });
});
