import { describe, expect, it } from "vitest";
import { getLocalMinutesSinceMidnight, localDateAndMinutesToUtc } from "@/lib/timezone";

/**
 * Pins the 2026 Canadian permanent-daylight-time changes (tzdata 2026b–2026e).
 * These assertions are about the *runtime's* bundled time zone data, not app
 * logic: if this file fails, the Node running it is too old and every
 * conversion for these zones is an hour off. Upgrade Node (24.22.1+), don't
 * edit the expectations.
 */
describe("runtime time zone data", () => {
  const nov12 = { year: 2026, month: 11, day: 12 };
  const sevenPm = 19 * 60;

  it.each([
    ["America/Vancouver", "2026-11-13T02:00:00.000Z"], // -07 year-round
    ["America/Edmonton", "2026-11-13T01:00:00.000Z"], // -06 year-round
    ["America/Winnipeg", "2026-11-13T00:00:00.000Z"], // -05 year-round
  ])("treats 7 PM on 2026-11-12 in %s as permanent daylight time", (zone, utc) => {
    const instant = localDateAndMinutesToUtc(nov12, sevenPm, zone);
    expect(instant.toISOString()).toBe(utc);
    expect(getLocalMinutesSinceMidnight(instant, zone)).toBe(sevenPm);
  });

  it("still falls back where nothing changed (Los Angeles is -08 in November)", () => {
    const instant = localDateAndMinutesToUtc(nov12, sevenPm, "America/Los_Angeles");
    expect(instant.toISOString()).toBe("2026-11-13T03:00:00.000Z");
  });
});
