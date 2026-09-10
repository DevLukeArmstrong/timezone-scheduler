import { describe, expect, it } from "vitest";
import { newAvailabilityMessage } from "@/lib/services/notifications";
import { WEEKDAY_BITS } from "@/lib/recurrence";

describe("newAvailabilityMessage", () => {
  it("describes a one-off window with viewer-local Discord timestamps", () => {
    const message = newAvailabilityMessage("Luke", "Friday Gaming", {
      kind: "one-off",
      startTime: new Date("2026-09-11T07:00:00Z"),
      endTime: new Date("2026-09-11T10:00:00Z"),
    });
    expect(message).toBe(
      "📅 **Luke** is free <t:1789110000:F> – <t:1789120800:t> · *Friday Gaming*",
    );
  });

  it("describes a recurring rule in its own zone plus the first occurrence", () => {
    const message = newAvailabilityMessage("Luke", "Friday Gaming", {
      kind: "recurring",
      rule: {
        timeZone: "Pacific/Auckland",
        startMinute: 19 * 60,
        endMinute: 22 * 60,
        daysOfWeek: WEEKDAY_BITS.mon | WEEKDAY_BITS.wed,
        rangeEnd: { year: 2026, month: 12, day: 20 },
      },
      firstStart: new Date("2026-09-14T07:00:00Z"),
      firstEnd: new Date("2026-09-14T10:00:00Z"),
    });
    expect(message).toBe(
      "🔁 **Luke** is free every Mon/Wed 19:00–22:00 (Pacific/Auckland) until 2026-12-20 · *Friday Gaming*\n" +
        "First one: <t:1789369200:F> – <t:1789380000:t>",
    );
  });

  it("says 'every day' for a null or full mask", () => {
    const base = {
      kind: "recurring" as const,
      firstStart: new Date("2026-09-14T07:00:00Z"),
      firstEnd: new Date("2026-09-14T10:00:00Z"),
    };
    const rule = { timeZone: "UTC", startMinute: 0, endMinute: 60 };
    expect(
      newAvailabilityMessage("L", "G", { ...base, rule: { ...rule, daysOfWeek: null } }),
    ).toContain("free every day 00:00–01:00");
    expect(
      newAvailabilityMessage("L", "G", { ...base, rule: { ...rule, daysOfWeek: 127 } }),
    ).toContain("free every day 00:00–01:00");
    expect(
      newAvailabilityMessage("L", "G", { ...base, rule: { ...rule, daysOfWeek: WEEKDAY_BITS.fri } }),
    ).toContain("free every Fri 00:00–01:00");
  });
});
