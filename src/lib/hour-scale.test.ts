import { describe, expect, it } from "vitest";
import {
  OFFPEAK_ROW_PX,
  PEAK_ROW_PX,
  buildHourScale,
  formatMinutesLabel,
  rangeFromClick,
  rangeFromDrag,
} from "@/lib/hour-scale";

describe("buildHourScale", () => {
  it("compresses off-peak hours and keeps peak hours full height", () => {
    const scale = buildHourScale(17, 24, false);
    expect(scale.rowHeight(3)).toBe(OFFPEAK_ROW_PX);
    expect(scale.rowHeight(18)).toBe(PEAK_ROW_PX);
    expect(scale.totalHeight).toBe(17 * OFFPEAK_ROW_PX + 7 * PEAK_ROW_PX);
  });

  it("is a uniform grid when expanded", () => {
    const scale = buildHourScale(17, 24, true);
    expect(scale.totalHeight).toBe(24 * PEAK_ROW_PX);
    expect(scale.offsetAt(12.5)).toBe(12.5 * PEAK_ROW_PX);
  });

  it("hourAt inverts offsetAt across both row heights", () => {
    const scale = buildHourScale(17, 23, false);
    for (const hour of [0, 0.25, 5.5, 16.75, 17, 17.5, 19.25, 22.75, 23, 23.5, 24]) {
      expect(scale.hourAt(scale.offsetAt(hour))).toBeCloseTo(hour, 6);
    }
  });

  it("hourAt clamps outside the column", () => {
    const scale = buildHourScale(17, 24, false);
    expect(scale.hourAt(-50)).toBe(0);
    expect(scale.hourAt(scale.totalHeight + 50)).toBe(24);
  });
});

describe("rangeFromDrag", () => {
  it("covers every 15-minute cell touched, whichever way the drag went", () => {
    const down = rangeFromDrag(7 + 5 / 60, 8 + 55 / 60);
    const up = rangeFromDrag(8 + 55 / 60, 7 + 5 / 60);
    expect(down).toEqual({ startMinute: 7 * 60, endMinute: 9 * 60 });
    expect(up).toEqual(down);
  });

  it("is never shorter than one cell", () => {
    expect(rangeFromDrag(19.5, 19.5)).toEqual({ startMinute: 1170, endMinute: 1185 });
  });

  it("can run right up to midnight but not past it", () => {
    expect(rangeFromDrag(22, 24)).toEqual({ startMinute: 1320, endMinute: 1440 });
    expect(rangeFromDrag(24, 24)).toEqual({ startMinute: 1425, endMinute: 1440 });
  });
});

describe("rangeFromClick", () => {
  it("makes an hour from the clicked cell", () => {
    expect(rangeFromClick(19 + 20 / 60)).toEqual({ startMinute: 1155, endMinute: 1215 });
  });

  it("stops at midnight", () => {
    expect(rangeFromClick(23.5)).toEqual({ startMinute: 1410, endMinute: 1440 });
    expect(rangeFromClick(24)).toEqual({ startMinute: 1425, endMinute: 1440 });
  });
});

describe("formatMinutesLabel", () => {
  it("formats 12-hour clock times", () => {
    expect(formatMinutesLabel(0)).toBe("12:00 AM");
    expect(formatMinutesLabel(615)).toBe("10:15 AM");
    expect(formatMinutesLabel(720)).toBe("12:00 PM");
    expect(formatMinutesLabel(1170)).toBe("7:30 PM");
    expect(formatMinutesLabel(1440)).toBe("12:00 AM");
  });
});
