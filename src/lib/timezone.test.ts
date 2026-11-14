import { describe, expect, it } from "vitest";
import { formatTimeZoneConversions } from "@/lib/timezone";

// Mon 2026-11-16 03:00–05:00 UTC = Sun 7–9 PM in Vancouver (PST, UTC-8).
const start = new Date("2026-11-16T03:00:00Z");
const end = new Date("2026-11-16T05:00:00Z");

describe("formatTimeZoneConversions", () => {
  it("puts the viewer's own zone first, then favorites", () => {
    const rows = formatTimeZoneConversions(start, end, "America/Vancouver", [
      "Europe/London",
      "Australia/Melbourne",
    ]);
    expect(rows.map((row) => [row.zone, row.isOwn])).toEqual([
      ["America/Vancouver", true],
      ["Europe/London", false],
      ["Australia/Melbourne", false],
    ]);
    expect(rows[0].range).toBe("Sun 7:00 PM – Sun 9:00 PM");
    expect(rows[1].range).toBe("Mon 3:00 AM – Mon 5:00 AM");
    expect(rows[2].range).toBe("Mon 2:00 PM – Mon 4:00 PM");
  });

  it("doesn't list the own zone twice when it's also a favorite", () => {
    const rows = formatTimeZoneConversions(start, end, "Europe/London", [
      "Europe/London",
      "America/Vancouver",
      "America/Vancouver",
    ]);
    expect(rows.map((row) => row.zone)).toEqual(["Europe/London", "America/Vancouver"]);
  });

  it("still shows the own zone with no favorites", () => {
    const rows = formatTimeZoneConversions(start, end, "America/Vancouver", []);
    expect(rows).toEqual([
      { zone: "America/Vancouver", range: "Sun 7:00 PM – Sun 9:00 PM", isOwn: true },
    ]);
  });
});
