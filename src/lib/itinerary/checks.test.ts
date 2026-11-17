import { describe, expect, it } from "vitest";
import { checkDay } from "./checks";
import type { Item } from "./types";

const item = (title: string, start: string | null, end: string | null = null, o: Partial<Item> = {}): Item => ({
  id: title,
  day_id: "d",
  type: "activity",
  title,
  start_time: start && `${start}:00`,
  end_time: end && `${end}:00`,
  slot: null,
  position: 0,
  status: "planned",
  cost_amount: null,
  cost_currency: null,
  notes: "",
  url: null,
  place: null,
  ...o,
});

describe("checking a day's times", () => {
  it("finds nothing wrong with plans that follow one another", () => {
    expect(checkDay([item("Shrine", "09:00", "11:00"), item("Lunch", "11:00", "12:00"), item("Walk", null), item("Museum", "14:00")])).toEqual([]);
  });

  it("flags a plan that runs into the next one", () => {
    expect(checkDay([item("Museum", "13:00", "15:00"), item("Lunch", "12:30", "13:30")])).toEqual([
      { kind: "overlap", itemIds: ["Lunch", "Museum"], message: "Lunch runs until 13:30, but Museum starts at 13:00." },
    ]);
  });

  it("flags two plans that start together", () => {
    expect(checkDay([item("Tea", "15:00"), item("Temple", "15:00")])[0]).toMatchObject({ kind: "same-start", message: "Tea and Temple both start at 15:00." });
  });

  it("compares a long plan with everything inside it, not just the next one", () => {
    const checks = checkDay([item("Day trip", "09:00", "18:00"), item("Lunch", "12:00", "13:00"), item("Tea", "15:00")]);
    expect(checks.map((c) => c.itemIds)).toEqual([
      ["Day trip", "Lunch"],
      ["Day trip", "Tea"],
    ]);
  });

  it("can't tell without an end time, so says nothing", () => {
    expect(checkDay([item("Shrine", "09:00"), item("Lunch", "09:30")])).toEqual([]);
  });

  it("leaves out where you sleep and notes", () => {
    expect(checkDay([item("Guesthouse", "15:00", "23:00", { type: "stay" }), item("Dinner", "19:00"), item("Remember passports", "19:00", null, { type: "note" })])).toEqual([]);
  });
});
