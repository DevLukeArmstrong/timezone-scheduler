import { describe, expect, it } from "vitest";
import { upcomingWeekStart, weeklyReminderMessage } from "@/lib/services/reminders";

describe("upcomingWeekStart", () => {
  it("is the Monday after the current Auckland week", () => {
    // Friday 11 Sep 2026 15:00 NZST → week of Monday 14 Sep.
    expect(upcomingWeekStart(new Date("2026-09-11T03:00:00Z"), "Pacific/Auckland")).toEqual({
      year: 2026,
      month: 9,
      day: 14,
    });
    // Sunday 13 Sep 23:00 NZST is still "this week" → still Monday 14 Sep.
    expect(upcomingWeekStart(new Date("2026-09-13T11:00:00Z"), "Pacific/Auckland")).toEqual({
      year: 2026,
      month: 9,
      day: 14,
    });
    // One hour later it's Monday 14 Sep in Auckland → next week is the 21st.
    expect(upcomingWeekStart(new Date("2026-09-13T12:00:00Z"), "Pacific/Auckland")).toEqual({
      year: 2026,
      month: 9,
      day: 21,
    });
  });
});

describe("weeklyReminderMessage", () => {
  const week = { year: 2026, month: 9, day: 14 };

  it("names the members who opted in and counts the rest", () => {
    const message = weeklyReminderMessage("Friday Gaming", week, ["Alex", "Sam"], 1);
    expect(message).toContain("week of 2026-09-14");
    expect(message).toContain("*Friday Gaming*");
    expect(message).toContain("Still missing: **Alex**, **Sam**, and 1 other");
  });

  it("handles one, two, and only-unnamed members", () => {
    expect(weeklyReminderMessage("G", week, ["Alex"], 0)).toContain("Still missing: **Alex**\n");
    expect(weeklyReminderMessage("G", week, ["Alex", "Sam"], 0)).toContain(
      "Still missing: **Alex** and **Sam**",
    );
    expect(weeklyReminderMessage("G", week, [], 3)).toContain("Still missing: 3 others");
  });

  it("escapes markdown in the group name", () => {
    expect(weeklyReminderMessage("a_b", week, ["x"], 0)).toContain("*a\\_b*");
  });
});
