import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { OpInput, OpName } from "@/lib/itinerary/schemas";

/**
 * The edit tools the chat agent can call. Each one maps onto an op in
 * src/lib/itinerary/ops.ts, so chat edits and edits by hand share one path and
 * one undo history. The model names days by number and items by id; `toOp`
 * turns that into the op's input.
 */

const dayNumber = z.number().int().min(1).max(60);
const itemId = z.uuid().describe("The item's id, from [item:…] in the trip snapshot or from an add_item result.");
const kind = z
  .enum(["activity", "sight", "food", "stay", "transit", "flight", "rail", "note"])
  .describe("What kind of thing it is. 'stay' is where they sleep; 'transit' is getting around; 'rail' is a train.");
const partOfDay = z.enum(["morning", "afternoon", "evening", "night"]);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("24-hour local time, HH:MM.");
const status = z.enum(["idea", "planned", "booked"]);
const cost = z.number().nonnegative().max(10_000_000);
const currency = z.string().regex(/^[A-Z]{3}$/).describe("ISO currency code. Defaults to the trip's currency.");
const notes = z.string().max(2000);

const itemFields = {
  title: z.string().trim().min(1).max(200).describe("Short name as it should read on the itinerary, e.g. 'Fushimi Inari Shrine'."),
  kind,
  day: dayNumber.nullable().describe("Day number, or null to keep it in ideas (not on a day)."),
  place_id: z.uuid().nullable().describe("A place from search_places, so the item is pinned to a real location. null removes it."),
  part_of_day: partOfDay.nullable().describe("Rough timing. Use this or start_time, not both."),
  start_time: time.nullable(),
  end_time: time.nullable().describe("Always send start_time with it, even if the start isn't changing."),
  status,
  cost: cost.nullable().describe("For the whole group. An estimate unless the traveller gave the figure."),
  currency,
  notes,
};

export const toolSchemas = {
  add_item: z.object(itemFields).partial().required({ title: true }),
  update_item: z.object({ item_id: itemId, ...z.object(itemFields).partial().shape }),
  remove_item: z.object({ item_id: itemId }),
  reorder_item: z.object({ item_id: itemId, direction: z.enum(["earlier", "later"]) }),
  add_day: z.object({
    after_day: z.number().int().min(0).max(60).optional().describe("Insert after this day number; 0 puts it first. Leave out to add at the end."),
  }),
  remove_day: z.object({ day: dayNumber }),
  move_day: z.object({ day: dayNumber, to: dayNumber.describe("The position it should end up at.") }),
  set_day_city: z.object({ day: dayNumber, city: z.string().trim().max(120).nullable().describe("Where they sleep that night, or null to clear it.") }),
  update_trip: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    destination: z.string().trim().max(200).nullable().optional(),
    start_date: z.iso.date().nullable().optional().describe("First day, YYYY-MM-DD, or null to clear the dates."),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    budget: cost.nullable().optional().describe("Total budget for the group, in the trip's currency."),
  }),
  update_profile: z.object({
    travellers: z
      .object({ adults: z.number().int().min(1).max(30), child_ages: z.array(z.number().int().min(0).max(17)).max(20).optional() })
      .nullable()
      .optional(),
    pace: z.enum(["relaxed", "balanced", "packed"]).nullable().optional(),
    interests: z.array(z.string().trim().min(1).max(60)).max(30).optional().describe("The full list; it replaces the saved one."),
    dietary: z.array(z.string().trim().min(1).max(60)).max(20).optional().describe("The full list; it replaces the saved one."),
    accessibility: z.string().trim().max(500).nullable().optional(),
    add_preferences: z.array(z.string().trim().min(1).max(200)).max(10).optional().describe("Lasting preferences in the group's words, e.g. 'No early starts'."),
    remove_preferences: z.array(z.string().trim().min(1).max(200)).max(50).optional().describe("Saved preferences to drop, exactly as shown in the snapshot."),
  }),
} as const;

/** Read-only: these look something up and return text. They never change the trip. */
export const lookupSchemas = {
  search_places: z.object({
    query: z.string().trim().min(2).max(120).describe("What to look for: a name ('Fushimi Inari') or a kind of place ('ramen', 'bookshop')."),
    near_day: dayNumber.optional().describe("Prefer places near the city where the group stays on this day. Leave out to search near the trip's destination."),
  }),
  get_weather: z.object({ day: dayNumber.describe("The trip day to get the weather for. The trip needs dates.") }),
  travel_time: z.object({
    from_item_id: itemId.describe("An item that has a place."),
    to_item_id: itemId.describe("Another item that has a place."),
  }),
} as const;

export type LookupName = keyof typeof lookupSchemas;
export const isLookupName = (name: string): name is LookupName => name in lookupSchemas;

const lookupDescriptions: Record<LookupName, string> = {
  search_places:
    "Search real places by name or kind. Returns up to five with a place_id each; pass a place_id to add_item or update_item to pin the item to it. Data is from OpenStreetMap: names, kinds and locations only. It has no ratings, opening hours or prices, so don't claim any.",
  get_weather: "Weather for a trip day: a forecast when the day is within about two weeks, otherwise what that week has typically been like.",
  travel_time: "Rough travel time between two items that both have a place, estimated from the distance. Not a route or a timetable.",
};

export type ToolName = keyof typeof toolSchemas;

const descriptions: Record<ToolName, string> = {
  add_item:
    "Add something to a day, or to the ideas list when no day is given. Call it once per item. Returns the new item's id.",
  update_item:
    "Change an item: rename it, move it to another day or back to ideas, set its timing, status, cost or notes. Only include the fields that change.",
  remove_item: "Delete an item from the itinerary.",
  reorder_item: "Move an untimed item one place earlier or later within its part of the day. Timed items are ordered by their start time.",
  add_day: "Add an empty day to the trip. Later days are renumbered.",
  remove_day: "Remove a day. Its items move to ideas rather than being deleted, and later days are renumbered.",
  move_day: "Move a whole day, with everything on it, to another position. Days in between shift.",
  set_day_city: "Set or clear the city where the group stays on a day.",
  update_trip: "Change the trip's name, destination, first day, currency or budget.",
  update_profile:
    "Save lasting facts about the group to the trip profile: who is travelling, pace, interests, dietary needs, accessibility needs, and free-form preferences.",
};

/** Tool definitions for the Messages API. Order is fixed so the prompt prefix stays cacheable. */
const jsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const out: Record<string, unknown> = z.toJSONSchema(schema);
  delete out.$schema;
  return out;
};

export const tools: Anthropic.Beta.BetaTool[] = [
  ...(Object.keys(toolSchemas) as ToolName[]).map((name) => toolDefinition(name, descriptions[name], toolSchemas[name])),
  ...(Object.keys(lookupSchemas) as LookupName[]).map((name) => toolDefinition(name, lookupDescriptions[name], lookupSchemas[name])),
];

function toolDefinition(name: string, description: string, zodSchema: z.ZodType): Anthropic.Beta.BetaTool {
  const schema = jsonSchema(zodSchema);
  return {
    name,
    description,
    // Inputs are a few short fields, so they are left to arrive whole (no eager
    // input streaming): nothing is gained by streaming them, and a half-written
    // input can't be retried cleanly once the reply's text is on screen.
    input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
  };
}

export const isToolName = (name: string): name is ToolName => name in toolSchemas;

export class ToolInputError extends Error {}

type Op = { [N in OpName]: { op: N; input: OpInput<N> } }[OpName];

/**
 * Validates a tool call and turns it into an itinerary op. `trip.dayIds` maps
 * each day number to its id as the trip stands right now; a cost with no
 * currency takes the trip's.
 */
export function toOp(name: ToolName, raw: unknown, trip: { dayIds: ReadonlyMap<number, string>; currency: string }): Op {
  const { dayIds } = trip;
  const dayId = (n: number) => {
    const id = dayIds.get(n);
    if (!id) throw new ToolInputError(`There is no Day ${n}. The trip has ${dayIds.size} ${dayIds.size === 1 ? "day" : "days"}.`);
    return id;
  };
  const parse = <N extends ToolName>(n: N): z.output<(typeof toolSchemas)[N]> => {
    const result = toolSchemas[n].safeParse(raw);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new ToolInputError(`Invalid input${issue?.path.length ? ` at ${issue.path.join(".")}` : ""}: ${issue?.message ?? "check the fields"}`);
    }
    return result.data as z.output<(typeof toolSchemas)[N]>;
  };
  const nonEmpty = <T extends object>(fields: T): T => {
    if (Object.keys(fields).length === 0) throw new ToolInputError("Nothing to change. Include at least one field to update.");
    return fields;
  };
  /**
   * Fields shared by add_item and update_item, renamed for the op. Absent stays
   * absent. A new item's cost takes the trip's currency unless one is named; an
   * update leaves that to the op, which knows the item's own currency.
   */
  const itemPatch = (i: Partial<z.output<typeof toolSchemas.add_item>>, isNew: boolean) => ({
    ...(i.title !== undefined && { title: i.title }),
    ...(i.kind !== undefined && { type: i.kind }),
    ...(i.day !== undefined && { dayId: i.day === null ? null : dayId(i.day) }),
    ...(i.place_id !== undefined && { placeId: i.place_id }),
    ...(i.part_of_day !== undefined && { slot: i.part_of_day }),
    ...(i.start_time !== undefined && { startTime: i.start_time }),
    ...(i.end_time !== undefined && { endTime: i.end_time }),
    ...(i.status !== undefined && { status: i.status }),
    ...(i.cost !== undefined && { costAmount: i.cost }),
    ...(isNew ? i.cost != null && { costCurrency: i.currency ?? trip.currency } : i.currency !== undefined && { costCurrency: i.currency }),
    ...(i.notes !== undefined && { notes: i.notes }),
  });

  switch (name) {
    case "add_item": {
      const i = parse("add_item");
      return { op: "addItem", input: { dayId: null, ...itemPatch(i, true), title: i.title } };
    }
    case "update_item": {
      const { item_id, ...rest } = parse("update_item");
      return { op: "updateItem", input: { itemId: item_id, patch: nonEmpty(itemPatch(rest, false)) } };
    }
    case "remove_item":
      return { op: "deleteItem", input: { itemId: parse("remove_item").item_id } };
    case "reorder_item": {
      const i = parse("reorder_item");
      return { op: "moveItem", input: { itemId: i.item_id, direction: i.direction } };
    }
    case "add_day":
      return { op: "addDay", input: { after: parse("add_day").after_day ?? null } };
    case "remove_day":
      return { op: "removeDay", input: { dayId: dayId(parse("remove_day").day) } };
    case "move_day": {
      const i = parse("move_day");
      return { op: "moveDay", input: { dayId: dayId(i.day), to: i.to } };
    }
    case "set_day_city": {
      const i = parse("set_day_city");
      return { op: "updateDay", input: { dayId: dayId(i.day), baseCity: i.city } };
    }
    case "update_trip": {
      const i = parse("update_trip");
      return {
        op: "updateTrip",
        input: nonEmpty({
          ...(i.name !== undefined && { name: i.name }),
          ...(i.destination !== undefined && { destination: i.destination }),
          ...(i.start_date !== undefined && { startDate: i.start_date }),
          ...(i.currency !== undefined && { currency: i.currency }),
          ...(i.budget !== undefined && { budgetTotal: i.budget }),
        }),
      };
    }
    case "update_profile": {
      const i = parse("update_profile");
      return {
        op: "updateProfile",
        input: nonEmpty({
          ...(i.travellers !== undefined && {
            travellers: i.travellers && { adults: i.travellers.adults, childAges: i.travellers.child_ages ?? [] },
          }),
          ...(i.pace !== undefined && { pace: i.pace }),
          ...(i.interests !== undefined && { interests: i.interests }),
          ...(i.dietary !== undefined && { dietary: i.dietary }),
          ...(i.accessibility !== undefined && { accessibility: i.accessibility }),
          ...(i.add_preferences !== undefined && { addPreferences: i.add_preferences }),
          ...(i.remove_preferences !== undefined && { removePreferences: i.remove_preferences }),
        }),
      };
    }
  }
}
