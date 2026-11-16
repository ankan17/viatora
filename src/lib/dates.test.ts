import { describe, expect, it } from "vitest";
import { dayDate, dayLabel, tripSpan } from "./dates";

describe("dates", () => {
  it("derives day dates from the trip start, across month and year ends", () => {
    expect(dayDate("2026-03-30", 1)).toBe("2026-03-30");
    expect(dayDate("2026-03-30", 3)).toBe("2026-04-01");
    expect(dayDate("2026-12-31", 2)).toBe("2027-01-01");
    expect(dayDate(null, 2)).toBeNull();
  });

  it("labels days with or without dates", () => {
    expect(dayLabel(null, 2)).toBe("Day 2");
    expect(dayLabel("2026-03-02", 2)).toBe("Day 2 · Tue 3 Mar");
  });

  it("describes a trip's span", () => {
    expect(tripSpan(null, 4)).toBe("4 days");
    expect(tripSpan(null, 1)).toBe("1 day");
    expect(tripSpan("2026-03-03", 5)).toBe("3–7 Mar");
    expect(tripSpan("2026-03-30", 4)).toBe("30 Mar – 2 Apr");
  });
});
