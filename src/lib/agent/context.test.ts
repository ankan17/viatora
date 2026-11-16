import { describe, expect, it } from "vitest";
import type { Item, Itinerary } from "@/lib/itinerary/types";
import { describeTrip, turnContext } from "./context";

const item = (o: Partial<Item> & { id: string; title: string }): Item => ({
  day_id: "d1",
  type: "activity",
  start_time: null,
  end_time: null,
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

const trip: Itinerary = {
  trip: {
    id: "t",
    name: "Kyoto in spring",
    destination: "Kyoto",
    start_date: "2027-04-05",
    currency: "USD",
    budget_total: 3000,
    profile: { travellers: { adults: 2, childAges: [7] }, dietary: ["vegetarian"], preferences: ["No early starts"] },
  },
  days: [
    {
      id: "d1",
      number: 1,
      base_city: "Kyoto",
      notes: "",
      items: [
        item({ id: "i-eve", title: "Gion walk", slot: "evening", status: "idea", position: 1 }),
        item({ id: "i-lunch", title: "Lunch at Nishiki", type: "food", start_time: "12:30:00", end_time: "13:30:00", cost_amount: 40, cost_currency: "USD", notes: "Bring\ncash", position: 2 }),
      ],
    },
    { id: "d2", number: 2, base_city: null, notes: "", items: [] },
  ],
  ideas: [item({ id: "i-tea", title: "Tea ceremony", day_id: null, status: "idea" })],
  canEdit: true,
};

describe("the trip as the model sees it", () => {
  const text = describeTrip(trip, [
    { actor: "agent", summary: "Added “Gion walk” to Day 1", undone: true },
    { actor: "user", summary: "Set the trip dates", undone: false },
  ]);

  it("gives the trip details and the saved profile", () => {
    expect(text).toContain("Trip: Kyoto in spring (Kyoto)");
    expect(text).toContain("Dates: 2027-04-05 to 2027-04-06, 2 days");
    expect(text).toContain("Currency: USD. Budget: US$3,000.");
    expect(text).toContain("Travellers: 2 adults, children aged 7");
    expect(text).toContain("Dietary: vegetarian");
    expect(text).toContain("Preference: No early starts");
  });

  it("lists each day in the order the itinerary shows, with ids the tools can use", () => {
    const lunch = text.indexOf("- Lunch at Nishiki (food, 12:30–13:30, planned, US$40) [item:i-lunch]");
    const walk = text.indexOf("- Gion walk (activity, evening, idea) [item:i-eve]");
    expect(text).toContain("Day 1 · Mon 5 Apr · Kyoto");
    expect(lunch).toBeGreaterThan(-1);
    expect(walk).toBeGreaterThan(lunch); // afternoon before evening, whatever the stored position
    expect(text).toContain("  notes: Bring cash");
    expect(text).toContain("Day 2 · Tue 6 Apr\n(nothing planned)");
    expect(text).toContain("Ideas (not on a day)\n- Tea ceremony (activity, idea) [item:i-tea]");
  });

  it("says who made the latest changes and which were undone", () => {
    expect(text).toContain("- You: Added “Gion walk” to Day 1 (undone by the traveller)");
    expect(text).toContain("- Traveller, by hand: Set the trip dates");
  });

  it("copes with a trip that has no dates, profile or ideas", () => {
    const bare = describeTrip({ ...trip, trip: { ...trip.trip, destination: null, start_date: null, budget_total: null, profile: {} }, ideas: [] });
    expect(bare).toContain("Trip: Kyoto in spring\nDates: not set, 2 days\nCurrency: USD. Budget: not set.");
    expect(bare).toContain("Profile\nNothing saved yet.");
    expect(bare).toContain("Day 2\n(nothing planned)");
    expect(bare).toContain("Ideas (not on a day)\n(none)");
    expect(bare).not.toContain("Latest changes");
  });
});

describe("the turn's context", () => {
  it("names the day on screen", () => {
    expect(turnContext(trip, [], "d2")).toMatch(/^<trip>\n[\s\S]+\n<\/trip>\n<looking_at>Day 2 · Tue 6 Apr<\/looking_at>$/);
  });
  it("leaves the day out when none is in view", () => {
    expect(turnContext(trip, [], null)).not.toContain("looking_at");
  });
});
