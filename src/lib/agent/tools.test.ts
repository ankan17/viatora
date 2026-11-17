import { describe, expect, it } from "vitest";
import { schemas } from "@/lib/itinerary/schemas";
import { isLookupName, isToolName, ToolInputError, toOp, tools } from "./tools";

const ITEM = "3f0e2a5c-1b7d-4c8e-9a6f-2d4b6c8e0a1b";
const DAY = "7a1c9e2b-4d6f-4a8b-8c0d-1e3f5a7b9c2d";
const trip = {
  dayIds: new Map([
    [1, "day-one"],
    [2, "day-two"],
  ]),
  currency: "EUR",
};

describe("tool definitions", () => {
  it("are plain JSON Schema objects in a fixed order", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "add_item",
      "update_item",
      "remove_item",
      "reorder_item",
      "add_day",
      "remove_day",
      "move_day",
      "set_day_city",
      "update_trip",
      "update_profile",
      "add_packing_items",
      "update_packing_item",
      "remove_packing_items",
      "add_booking",
      "update_booking",
      "remove_booking",
      "rule_out",
      "restore_ruled_out",
      "search_places",
      "get_weather",
      "travel_time",
    ]);
    for (const tool of tools) {
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema).not.toHaveProperty("$schema");
      expect(tool.description).toBeTruthy();
    }
    expect(tools[0].input_schema.required).toEqual(["title"]);
  });

  it("know their own names", () => {
    expect(isToolName("add_item")).toBe(true);
    expect(isToolName("drop_table")).toBe(false);
    expect(isLookupName("search_places")).toBe(true);
    expect(isLookupName("add_item")).toBe(false);
  });
});

describe("turning a tool call into an edit", () => {
  it("puts an item on a day by number, and in ideas without one", () => {
    expect(toOp("add_item", { title: "Ramen", kind: "food", day: 2, part_of_day: "evening" }, trip)).toEqual({
      op: "addItem",
      input: { title: "Ramen", type: "food", dayId: "day-two", slot: "evening" },
    });
    expect(toOp("add_item", { title: "Tea ceremony" }, trip)).toEqual({ op: "addItem", input: { title: "Tea ceremony", dayId: null } });
  });

  it("gives a new item's cost the trip's currency unless one is named", () => {
    expect(toOp("add_item", { title: "Museum", cost: 12 }, trip).input).toMatchObject({ costAmount: 12, costCurrency: "EUR" });
    expect(toOp("add_item", { title: "Museum", cost: 12, currency: "JPY" }, trip).input).toMatchObject({
      costAmount: 12,
      costCurrency: "JPY",
    });
    expect(toOp("add_item", { title: "Museum", currency: "JPY" }, trip).input).not.toHaveProperty("costCurrency");
  });

  it("leaves an existing item's currency to the op, which knows what the item has", () => {
    expect(toOp("update_item", { item_id: ITEM, cost: 60 }, trip).input).toEqual({ itemId: ITEM, patch: { costAmount: 60 } });
    expect(toOp("update_item", { item_id: ITEM, currency: "JPY" }, trip).input).toEqual({ itemId: ITEM, patch: { costCurrency: "JPY" } });
    expect(toOp("update_item", { item_id: ITEM, cost: null }, trip).input).toEqual({ itemId: ITEM, patch: { costAmount: null } });
  });

  it("refuses a call that would change nothing", () => {
    expect(() => toOp("update_item", { item_id: ITEM }, trip)).toThrow(/Nothing to change/);
    expect(() => toOp("update_trip", {}, trip)).toThrow(/Nothing to change/);
    expect(() => toOp("update_profile", {}, trip)).toThrow(/Nothing to change/);
  });

  it("only patches the fields that were given", () => {
    expect(toOp("update_item", { item_id: ITEM, day: null }, trip)).toEqual({
      op: "updateItem",
      input: { itemId: ITEM, patch: { dayId: null } },
    });
    expect(toOp("update_item", { item_id: ITEM, start_time: "09:30", status: "booked" }, trip).input).toEqual({
      itemId: ITEM,
      patch: { startTime: "09:30", status: "booked" },
    });
  });

  it("maps the day tools", () => {
    expect(toOp("add_day", {}, trip)).toEqual({ op: "addDay", input: { after: null } });
    expect(toOp("add_day", { after_day: 0 }, trip)).toEqual({ op: "addDay", input: { after: 0 } });
    expect(toOp("remove_day", { day: 1 }, trip)).toEqual({ op: "removeDay", input: { dayId: "day-one" } });
    expect(toOp("move_day", { day: 2, to: 1 }, trip)).toEqual({ op: "moveDay", input: { dayId: "day-two", to: 1 } });
    expect(toOp("set_day_city", { day: 1, city: null }, trip)).toEqual({ op: "updateDay", input: { dayId: "day-one", baseCity: null } });
  });

  it("maps trip details and the profile", () => {
    expect(toOp("update_trip", { start_date: "2027-05-14", budget: 2500 }, trip)).toEqual({
      op: "updateTrip",
      input: { startDate: "2027-05-14", budgetTotal: 2500 },
    });
    expect(toOp("update_profile", { travellers: { adults: 2, child_ages: [7] }, add_preferences: ["No early starts"] }, trip)).toEqual({
      op: "updateProfile",
      input: { travellers: { adults: 2, childAges: [7] }, addPreferences: ["No early starts"] },
    });
  });

  it("explains a day that doesn't exist, so the model can correct itself", () => {
    expect(() => toOp("remove_day", { day: 9 }, trip)).toThrow(new ToolInputError("There is no Day 9. The trip has 2 days."));
  });

  it("rejects input that doesn't fit the schema, naming the field", () => {
    expect(() => toOp("add_item", { title: "x", start_time: "9am" }, trip)).toThrow(/Invalid input at start_time/);
    expect(() => toOp("update_item", { item_id: "not-an-id" }, trip)).toThrow(ToolInputError);
    expect(() => toOp("add_item", {}, trip)).toThrow(/Invalid input at title/);
    expect(() => toOp("update_trip", { name: "x".repeat(121) }, trip)).toThrow(/Invalid input at name/);
  });

  it("produces input the op's own schema accepts", () => {
    const real = { dayIds: new Map([[1, DAY]]), currency: "EUR" };
    const calls: [Parameters<typeof toOp>[0], unknown][] = [
      [
        "add_item",
        { title: "Ramen", kind: "food", day: 1, start_time: "19:00", end_time: "20:00", status: "booked", cost: 30, notes: "Cash only" },
      ],
      ["add_item", { title: "Tea ceremony" }],
      ["update_item", { item_id: ITEM, day: null, part_of_day: null, start_time: null, end_time: null, cost: null }],
      ["update_item", { item_id: ITEM, currency: "JPY" }],
      ["add_item", { title: "Ichiran", place_id: DAY }],
      ["update_item", { item_id: ITEM, place_id: null }],
      ["remove_item", { item_id: ITEM }],
      ["reorder_item", { item_id: ITEM, direction: "later" }],
      ["add_day", {}],
      ["remove_day", { day: 1 }],
      ["move_day", { day: 1, to: 3 }],
      ["set_day_city", { day: 1, city: "Kyoto" }],
      ["update_trip", { name: "Kyoto", destination: null, start_date: null, currency: "JPY", budget: null }],
      [
        "update_profile",
        {
          travellers: { adults: 2 },
          pace: null,
          interests: ["food"],
          dietary: [],
          accessibility: null,
          add_preferences: ["Slow mornings"],
          remove_preferences: ["x"],
        },
      ],
    ];
    for (const [name, input] of calls) {
      const { op, input: mapped } = toOp(name, input, real);
      expect(schemas[op].safeParse(mapped).error?.issues, `${name} -> ${op}`).toBeUndefined();
    }
  });
});

describe("list tools", () => {
  const PACK = "5b2d7c9e-1a3f-4e6b-8d0c-2f4a6c8e0b1d";
  const BOOKING = "9c4e1a7b-3d5f-4b8a-a2c6-0e8d4f6b2a13";

  it("add several packing items at once, each with its reason", () => {
    expect(
      toOp(
        "add_packing_items",
        {
          items: [
            { label: "Rain jacket", reason: "Rain on day 3", category: "Clothes" },
            { label: "Passport", reason: "Flights", quantity: 2 },
          ],
        },
        trip,
      ),
    ).toEqual({
      op: "addPacking",
      input: {
        items: [
          { label: "Rain jacket", reason: "Rain on day 3", category: "Clothes" },
          { label: "Passport", reason: "Flights", quantity: 2 },
        ],
      },
    });
    // The reason is what makes the list useful, so the model has to give one.
    expect(() => toOp("add_packing_items", { items: [{ label: "Hat" }] }, trip)).toThrow(ToolInputError);
    expect(() => toOp("add_packing_items", { items: [] }, trip)).toThrow(ToolInputError);
  });

  it("change or tick off one packing item, and refuse an empty change", () => {
    expect(toOp("update_packing_item", { pack_id: PACK, packed: true }, trip)).toEqual({
      op: "updatePacking",
      input: { packingId: PACK, patch: { packed: true } },
    });
    expect(() => toOp("update_packing_item", { pack_id: PACK }, trip)).toThrow(/Nothing to change/);
    expect(toOp("remove_packing_items", { pack_ids: [PACK] }, trip)).toEqual({ op: "removePacking", input: { packingIds: [PACK] } });
  });

  it("record a booking, with the trip's currency for a cost", () => {
    expect(
      toOp("add_booking", { kind: "stay", title: "Hotel Gion", cost: 540, starts_at: "2027-04-05T15:00", confirmation_ref: "GX-1" }, trip),
    ).toEqual({
      op: "addBooking",
      input: {
        kind: "stay",
        title: "Hotel Gion",
        costAmount: 540,
        costCurrency: "EUR",
        startsAt: "2027-04-05T15:00",
        confirmationRef: "GX-1",
      },
    });
    expect(toOp("update_booking", { booking_id: BOOKING, status: "cancelled" }, trip)).toEqual({
      op: "updateBooking",
      input: { bookingId: BOOKING, patch: { status: "cancelled" } },
    });
    expect(toOp("remove_booking", { booking_id: BOOKING }, trip)).toEqual({ op: "deleteBooking", input: { bookingId: BOOKING } });
    expect(() => toOp("add_booking", { title: "No kind" }, trip)).toThrow(ToolInputError);
    expect(() => toOp("add_booking", { kind: "stay", title: "Late", starts_at: "next Tuesday" }, trip)).toThrow(ToolInputError);
  });

  it("rule something out and bring it back", () => {
    expect(toOp("rule_out", { label: "Night buses", reason: "Too slow" }, trip)).toEqual({
      op: "addRuledOut",
      input: { label: "Night buses", reason: "Too slow" },
    });
    expect(toOp("restore_ruled_out", { out_id: PACK }, trip)).toEqual({ op: "removeRuledOut", input: { ruledOutId: PACK } });
  });
});

describe("list op inputs", () => {
  it("accept only web addresses as booking links", () => {
    const ok = schemas.addBooking.safeParse({ kind: "stay", title: "x", url: "https://example.com/a" });
    expect(ok.success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "example.com", "ftp://example.com"]) {
      expect(schemas.addBooking.safeParse({ kind: "stay", title: "x", url }).success, url).toBe(false);
    }
  });

  it("refuse a booking that ends before it starts", () => {
    const r = schemas.addBooking.safeParse({ kind: "car", title: "x", startsAt: "2027-04-03T10:00", endsAt: "2027-04-03T09:00" });
    expect(r.success).toBe(false);
    expect(schemas.addBooking.safeParse({ kind: "car", title: "x", startsAt: "2027-04-03", endsAt: "2027-04-05" }).success).toBe(true);
  });
});

describe("dates that don't exist", () => {
  it("are refused before the database sees them", () => {
    for (const startsAt of ["2027-02-31T10:00", "2027-13-01", "2027-04-31"]) {
      expect(schemas.addBooking.safeParse({ kind: "car", title: "x", startsAt }).success, startsAt).toBe(false);
      expect(() => toOp("add_booking", { kind: "car", title: "x", starts_at: startsAt }, trip), startsAt).toThrow(ToolInputError);
    }
    expect(schemas.addBooking.safeParse({ kind: "car", title: "x", startsAt: "2028-02-29T10:00" }).success).toBe(true);
  });
});
