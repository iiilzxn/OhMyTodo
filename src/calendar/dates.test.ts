import { describe, expect, it } from "vitest";
import {
  dayInfo,
  daysBetween,
  monthDays,
  orderedRange,
  rangeStats,
  validDay,
  weekSpans,
} from "./dates";
import { HOLIDAY_YEARS, officialDay } from "./holidays";
import type { CalendarMark } from "../model";
function mark(id: string, startDate: string, endDate: string): CalendarMark {
  return {
    id,
    title: id,
    startDate,
    endDate,
    color: "blue",
    notes: "",
    createdAt: "2026-09-27T00:00:00Z",
    updatedAt: "2026-09-27T00:00:00Z",
  };
}
describe("independent calendar", () => {
  it("lays out Monday-first six-week calendars across years and leap days", () => {
    expect(monthDays("2026-09")[0]).toBe("2026-08-31");
    expect(monthDays("2026-09")[41]).toBe("2026-10-11");
    expect(monthDays("2026-02")[0]).toBe("2026-01-26");
    expect(
      monthDays("2028-02").filter((d) => d.startsWith("2028-02")),
    ).toHaveLength(29);
    expect(
      monthDays("2100-02").filter((d) => d.startsWith("2100-02")),
    ).toHaveLength(28);
    expect(validDay("2026-02-30")).toBe(false);
    expect(validDay("2028-02-29")).toBe(true);
  });
  it("uses the announced 2026 holiday and make-up-work dates exactly", () => {
    const restDays = HOLIDAY_YEARS[2026].breaks.reduce(
      (n, h) => n + daysBetween(h.start, h.end) + 1,
      0,
    );
    expect(restDays).toBe(33);
    expect(HOLIDAY_YEARS[2026].workdays).toHaveLength(6);
    expect(officialDay("2026-09-20")?.kind).toBe("work");
    expect(officialDay("2026-09-27")?.kind).toBe("rest");
    expect(officialDay("2026-10-10")?.kind).toBe("work");
    expect(officialDay("2026-10-11")).toBeNull();
    expect(dayInfo("2026-10-01").statutory).toBe(true);
    expect(dayInfo("2026-10-07").statutory).toBe(false);
    expect(dayInfo("2026-02-16").statutory).toBe(true);
  });
  it("separates lunar festivals and solar terms from official rest days", () => {
    expect(dayInfo("2026-09-25").festival).toBe("中秋节");
    expect(dayInfo("2026-04-05").term).toBe("清明");
    expect(dayInfo("2027-01-01").festival).toBe("元旦");
    expect(dayInfo("2027-01-01").official).toBeNull();
    expect(rangeStats({ start: "2027-01-01", end: "2027-01-03" }).known).toBe(
      false,
    );
  });
  it("counts inclusive ranges and respects official make-up weekends", () => {
    expect(orderedRange("2026-10-07", "2026-09-28")).toEqual({
      start: "2026-09-28",
      end: "2026-10-07",
    });
    expect(
      rangeStats({ start: "2026-09-28", end: "2026-10-07" }),
    ).toMatchObject({ days: 10, workdays: 3, restdays: 7, known: true });
    expect(
      rangeStats({ start: "2026-10-10", end: "2026-10-10" }).workdays,
    ).toBe(1);
  });
  it("places overlapping ranges into distinct lanes and preserves continuations", () => {
    const spans = weekSpans(
      [
        mark("A", "2026-09-28", "2026-10-07"),
        mark("B", "2026-10-01", "2026-10-01"),
        mark("C", "2026-10-04", "2026-10-12"),
      ],
      "2026-09-28",
    );
    expect(spans.map((s) => s.lane)).toEqual([0, 1, 1]);
    expect(spans[0]).toMatchObject({ start: 0, end: 6, continuesAfter: true });
    expect(
      weekSpans([mark("A", "2026-09-28", "2026-10-07")], "2026-10-05")[0],
    ).toMatchObject({ start: 0, end: 2, continuesBefore: true });
  });
});
