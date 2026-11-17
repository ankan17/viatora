import { describe, expect, it } from "vitest";
import { budgetOf } from "./budget";
import type { Booking, Day, Item } from "./types";

const item = (cost: number | null, currency: string | null, over: Partial<Item> = {}): Item => ({
  id: crypto.randomUUID(),
  day_id: "d",
  type: "activity",
  title: "x",
  start_time: null,
  end_time: null,
  slot: null,
  position: 1,
  status: "planned",
  cost_amount: cost,
  cost_currency: currency,
  notes: "",
  url: null,
  place: null,
  ...over,
});
const booking = (cost: number | null, currency: string | null, status: Booking["status"] = "confirmed"): Booking => ({
  id: crypto.randomUUID(),
  kind: "stay",
  title: "x",
  provider_name: null,
  confirmation_ref: null,
  starts_at: null,
  ends_at: null,
  cost_amount: cost,
  cost_currency: currency,
  status,
  url: null,
  notes: "",
});
const day = (number: number, items: Item[]): Day => ({ id: `d${number}`, number, base_city: null, notes: "", items });
const trip = (budget_total: number | null) => ({
  id: "t",
  name: "T",
  destination: null,
  start_date: null,
  currency: "EUR",
  budget_total,
  profile: {},
});

describe("the budget", () => {
  it("adds costs on days and live bookings, and says what is left", () => {
    const b = budgetOf({
      trip: trip(1000),
      days: [day(1, [item(40, "EUR"), item(10.5, "EUR"), item(null, null)]), day(2, [])],
      ideas: [item(25, "EUR", { day_id: null, status: "idea" })],
      bookings: [booking(300, "EUR"), booking(999, "EUR", "cancelled")],
    });
    expect(b.planned).toBe(350.5);
    expect(b.onDays).toEqual([
      { day: 1, amount: 50.5 },
      { day: 2, amount: 0 },
    ]);
    expect(b.bookings).toBe(300);
    expect(b.ideas).toBe(25); // shown apart, never in the total
    expect(b.left).toBe(649.5);
  });

  it("goes negative when over, and has no 'left' without a budget", () => {
    expect(budgetOf({ trip: trip(100), days: [day(1, [item(150, "EUR")])], ideas: [], bookings: [] }).left).toBe(-50);
    expect(budgetOf({ trip: trip(null), days: [day(1, [item(150, "EUR")])], ideas: [], bookings: [] }).left).toBeNull();
  });

  it("lists other currencies instead of converting them", () => {
    const b = budgetOf({
      trip: trip(500),
      days: [day(1, [item(100, "EUR"), item(8000, "JPY")])],
      ideas: [item(3000, "JPY", { day_id: null })],
      bookings: [booking(200, "JPY"), booking(50, "GBP")],
    });
    expect(b.planned).toBe(100);
    expect(b.other).toEqual([
      { currency: "GBP", amount: 50 },
      { currency: "JPY", amount: 8200 },
    ]);
  });

  it("does not drift on cents", () => {
    const b = budgetOf({ trip: trip(null), days: [day(1, [item(0.1, "EUR"), item(0.2, "EUR")])], ideas: [], bookings: [] });
    expect(b.planned).toBe(0.3);
  });
});
