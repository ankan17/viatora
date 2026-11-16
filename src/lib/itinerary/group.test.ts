import { describe, expect, it } from "vitest";
import { formatCost, groupDay, sectionOf, slotForTime, timeRange } from "./group";
import type { Item } from "./types";

const item = (o: Partial<Item>): Item => ({
  id: o.title ?? "x",
  day_id: "d",
  type: "activity",
  title: "x",
  start_time: null,
  end_time: null,
  slot: null,
  position: 0,
  status: "idea",
  cost_amount: null,
  cost_currency: null,
  notes: "",
  url: null,
  place: null,
  ...o,
});

describe("grouping a day", () => {
  it("places timed items by their time and untimed ones by slot", () => {
    expect(slotForTime("08:00:00")).toBe("morning");
    expect(slotForTime("12:00:00")).toBe("afternoon");
    expect(slotForTime("19:30:00")).toBe("evening");
    expect(slotForTime("23:00:00")).toBe("night");
    expect(slotForTime("01:00:00")).toBe("night");
    expect(sectionOf(item({ slot: "evening" }))).toBe("evening");
    expect(sectionOf(item({}))).toBe("anytime");
    expect(sectionOf(item({ type: "stay", slot: "evening" }))).toBe("stay");
  });

  it("orders sections through the day, timed items first, empty sections dropped", () => {
    const sections = groupDay([
      item({ title: "Hotel", type: "stay" }),
      item({ title: "Dinner", slot: "evening" }),
      item({ title: "Late lunch", start_time: "14:30:00" }),
      item({ title: "Market", slot: "afternoon", position: 2 }),
      item({ title: "Gallery", slot: "afternoon", position: 1 }),
      item({ title: "Shrine", start_time: "08:00:00" }),
      item({ title: "Postcards" }),
    ]);
    expect(sections.map((s) => [s.label, s.items.map((i) => i.title)])).toEqual([
      ["Any time", ["Postcards"]],
      ["Morning", ["Shrine"]],
      ["Afternoon", ["Late lunch", "Gallery", "Market"]],
      ["Evening", ["Dinner"]],
      ["Stay", ["Hotel"]],
    ]);
  });
});

describe("formatting", () => {
  it("shows time ranges", () => {
    expect(timeRange({ start_time: "09:30:00", end_time: "11:00:00" })).toBe("09:30–11:00");
    expect(timeRange({ start_time: "09:30:00", end_time: null })).toBe("09:30");
    expect(timeRange({ start_time: null, end_time: null })).toBeNull();
  });

  it("formats costs", () => {
    expect(formatCost(40, "EUR")).toBe("€40");
    expect(formatCost(12.5, "GBP")).toBe("£12.50");
    expect(formatCost(null, "EUR")).toBeNull();
  });
});
