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
