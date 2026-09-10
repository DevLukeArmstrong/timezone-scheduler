import { describe, expect, it } from "vitest";
import { isWeeklyReminderDue } from "@/lib/services/scheduler";

// Pacific/Auckland is UTC+12 (NZST) from April to late September and
// UTC+13 (NZDT) otherwise. Both halves are covered so the schedule can't
// silently drift an hour when the clocks change.
describe("isWeeklyReminderDue", () => {
  it("fires from 15:00 Friday NZST (03:00 UTC Friday)", () => {
    expect(isWeeklyReminderDue(new Date("2026-09-11T02:59:00Z"))).toBe(false);
    expect(isWeeklyReminderDue(new Date("2026-09-11T03:00:00Z"))).toBe(true);
    expect(isWeeklyReminderDue(new Date("2026-09-11T11:59:00Z"))).toBe(true); // 23:59 NZST
    expect(isWeeklyReminderDue(new Date("2026-09-11T12:00:00Z"))).toBe(false); // Saturday NZ
  });

  it("fires from 15:00 Friday NZDT (02:00 UTC Friday) once daylight saving starts", () => {
    // NZDT begins 27 Sep 2026; 16 Oct is a Friday.
    expect(isWeeklyReminderDue(new Date("2026-10-16T01:59:00Z"))).toBe(false);
    expect(isWeeklyReminderDue(new Date("2026-10-16T02:00:00Z"))).toBe(true);
  });

  it("is Friday in Auckland, not wherever the server is", () => {
    // Thursday 20:00 Vancouver = Friday 15:00 Auckland (NZST).
    expect(isWeeklyReminderDue(new Date("2026-09-11T03:00:00Z"))).toBe(true);
    // Friday 15:00 UTC is already Saturday 03:00 in Auckland.
    expect(isWeeklyReminderDue(new Date("2026-09-11T15:00:00Z"))).toBe(false);
    // Thursday afternoon Auckland is not Friday.
    expect(isWeeklyReminderDue(new Date("2026-09-10T03:00:00Z"))).toBe(false);
  });
});
