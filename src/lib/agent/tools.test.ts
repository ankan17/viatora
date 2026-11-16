import { describe, expect, it } from "vitest";
import { isToolName, ToolInputError, toOp, tools } from "./tools";

const ITEM = "3f0e2a5c-1b7d-4c8e-9a6f-2d4b6c8e0a1b";
const trip = { dayIds: new Map([[1, "day-one"], [2, "day-two"]]), currency: "EUR" };

describe("tool definitions", () => {
  it("are plain JSON Schema objects in a fixed order", () => {
    expect(tools.map((t) => t.name)).toEqual([
      "add_item", "update_item", "remove_item", "reorder_item", "add_day", "remove_day", "move_day", "set_day_city", "update_trip", "update_profile",
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

  it("gives a cost the trip's currency unless one is named", () => {
    expect(toOp("add_item", { title: "Museum", cost: 12 }, trip).input).toMatchObject({ costAmount: 12, costCurrency: "EUR" });
    expect(toOp("add_item", { title: "Museum", cost: 12, currency: "JPY" }, trip).input).toMatchObject({ costAmount: 12, costCurrency: "JPY" });
    expect(toOp("update_item", { item_id: ITEM, cost: null }, trip).input).toEqual({ itemId: ITEM, patch: { costAmount: null, costCurrency: null } });
  });

  it("only patches the fields that were given", () => {
    expect(toOp("update_item", { item_id: ITEM, day: null }, trip)).toEqual({ op: "updateItem", input: { itemId: ITEM, patch: { dayId: null } } });
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
  });
});
