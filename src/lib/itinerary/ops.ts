import "server-only";
import { z } from "zod";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { compareItems, sectionOf } from "./group";
import { slotLabel, type DaySlot, type Item } from "./types";

/**
 * Itinerary edits. Each op validates its input, reads what it needs, decides a
 * one-line summary, then writes through a client bound to the edit's batch so
 * the database logs it for undo. The chat agent's edit tools (milestone 3) call
 * these same ops.
 */

export type Actor = "user" | "agent";
type ItemUpdate = Database["public"]["Tables"]["items"]["Update"];

export type EditContext = {
  tripId: string;
  batchId: string;
  actor: Actor;
  /** Reads, as the user. */
  db: ServerClient;
  /** A client whose writes join this edit's batch with the given summary. */
  writer: (summary: string) => Promise<ServerClient>;
};

export class EditError extends Error {}

// ───────────────────────── Schemas ─────────────────────────

const id = z.uuid();
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30")
  .nullable();
const slot = z.enum(["morning", "afternoon", "evening", "night"]).nullable();
const title = z.string().trim().min(1, "Give it a name").max(200);
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .nullable();
const amount = z.number().nonnegative().max(10_000_000).nullable();

const itemFields = z.object({
  title,
  type: z.enum(["activity", "sight", "food", "stay", "transit", "flight", "rail", "note"]),
  dayId: id.nullable(),
  slot,
  startTime: time,
  endTime: time,
  status: z.enum(["idea", "planned", "booked"]),
  costAmount: amount,
  costCurrency: currency,
  notes: z.string().max(2000),
});

const checkTimes = (v: { startTime?: string | null; endTime?: string | null }) =>
  !v.endTime || (v.startTime != null && v.endTime > v.startTime);
const timesMessage = { message: "The end time needs a start time before it", path: ["endTime"] };

export const schemas = {
  addItem: itemFields
    .partial()
    .required({ title: true })
    .extend({ dayId: id.nullable() })
    .refine(checkTimes, timesMessage),
  updateItem: z.object({ itemId: id, patch: itemFields.partial().refine(checkTimes, timesMessage) }),
  deleteItem: z.object({ itemId: id }),
  moveItem: z.object({ itemId: id, direction: z.enum(["earlier", "later"]) }),
  addDay: z.object({ after: z.number().int().min(0).max(60).nullable().default(null) }),
  removeDay: z.object({ dayId: id }),
  moveDay: z.object({ dayId: id, to: z.number().int().min(1).max(60) }),
  updateDay: z.object({ dayId: id, baseCity: z.string().trim().max(120).nullable() }),
  updateTrip: z.object({
    name: title.optional(),
    destination: z.string().trim().max(200).nullable().optional(),
    startDate: z.iso.date().nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    budgetTotal: amount.optional(),
  }),
} as const;

export type OpName = keyof typeof schemas;
export type OpInput<N extends OpName> = z.input<(typeof schemas)[N]>;
type Parsed<N extends OpName> = z.output<(typeof schemas)[N]>;

// ───────────────────────── Helpers ─────────────────────────

async function getItem(ctx: EditContext, itemId: string) {
  const { data, error } = await ctx.db
    .from("items")
    .select("id, day_id, title, type, slot, start_time, end_time, status, position")
    .eq("id", itemId)
    .eq("trip_id", ctx.tripId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new EditError("That item no longer exists.");
  return data;
}

async function getDay(ctx: EditContext, dayId: string) {
  const { data, error } = await ctx.db.from("days").select("id, number, base_city").eq("id", dayId).eq("trip_id", ctx.tripId).maybeSingle();
  if (error) throw error;
  if (!data) throw new EditError("That day no longer exists.");
  return data;
}

async function nextPosition(ctx: EditContext, dayId: string | null) {
  let q = ctx.db.from("items").select("position").eq("trip_id", ctx.tripId).order("position", { ascending: false }).limit(1);
  q = dayId ? q.eq("day_id", dayId) : q.is("day_id", null);
  const { data } = await q;
  return (data?.[0]?.position ?? 0) + 1;
}

function check<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error;
  return res;
}

const quote = (s: string) => `“${s}”`;

/** Time wins over slot: setting one clears the other. */
function normaliseWhen(p: { slot?: DaySlot | null; startTime?: string | null; endTime?: string | null }) {
  const out: ItemUpdate = {};
  if (p.startTime !== undefined) {
    out.start_time = p.startTime;
    if (p.startTime) out.slot = null;
    if (!p.startTime) out.end_time = null;
  }
  if (p.endTime !== undefined && p.startTime !== null) out.end_time = p.endTime;
  if (p.slot !== undefined && !p.startTime) {
    out.slot = p.slot;
    if (p.slot) {
      out.start_time = null;
      out.end_time = null;
    }
  }
  return out;
}

// ───────────────────────── Ops ─────────────────────────

const run: { [N in OpName]: (ctx: EditContext, input: Parsed<N>) => Promise<{ summary: string; id?: string }> } = {
  async addItem(ctx, input) {
    const day = input.dayId ? await getDay(ctx, input.dayId) : null;
    const summary = `Added ${quote(input.title)} to ${day ? `Day ${day.number}` : "ideas"}`;
    const w = await ctx.writer(summary);
    const { data } = check(
      await w
        .from("items")
        .insert({
          trip_id: ctx.tripId,
          day_id: input.dayId,
          title: input.title,
          type: input.type ?? "activity",
          status: input.status ?? (day ? "planned" : "idea"),
          cost_amount: input.costAmount ?? null,
          cost_currency: input.costAmount != null ? input.costCurrency : null,
          notes: input.notes ?? "",
          position: await nextPosition(ctx, input.dayId),
          ...normaliseWhen(input),
        })
        .select("id")
        .single(),
    );
    return { summary, id: data!.id };
  },

  async updateItem(ctx, { itemId, patch }) {
    const before = await getItem(ctx, itemId);
    const update: ItemUpdate = { ...normaliseWhen(patch) };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.type !== undefined) update.type = patch.type;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.notes !== undefined) update.notes = patch.notes;
    if (patch.costAmount !== undefined) {
      update.cost_amount = patch.costAmount;
      update.cost_currency = patch.costAmount == null ? null : (patch.costCurrency ?? null);
    }
    if (patch.dayId !== undefined && patch.dayId !== before.day_id) {
      update.day_id = patch.dayId;
      update.position = await nextPosition(ctx, patch.dayId);
    }
    if (update.cost_amount != null && !update.cost_currency) throw new EditError("Pick a currency for the cost.");

    const name = quote(update.title ?? before.title);
    let summary = `Updated ${name}`;
    if (update.day_id !== undefined) {
      summary = update.day_id ? `Moved ${name} to Day ${(await getDay(ctx, update.day_id)).number}` : `Moved ${name} to ideas`;
    } else if (update.start_time && update.start_time !== before.start_time?.slice(0, 5)) {
      summary = `Moved ${name} to ${update.start_time}`;
    } else if (update.slot && update.slot !== before.slot) {
      summary = `Moved ${name} to the ${slotLabel(update.slot).toLowerCase()}`;
    } else if (update.status && update.status !== before.status && Object.keys(update).length === 1) {
      summary = `Marked ${name} as ${update.status}`;
    } else if (update.title && update.title !== before.title && Object.keys(update).length === 1) {
      summary = `Renamed ${quote(before.title)} to ${name}`;
    }

    const w = await ctx.writer(summary);
    check(await w.from("items").update(update).eq("id", itemId).eq("trip_id", ctx.tripId));
    return { summary, id: itemId };
  },

  async deleteItem(ctx, { itemId }) {
    const item = await getItem(ctx, itemId);
    const summary = `Removed ${quote(item.title)}`;
    const w = await ctx.writer(summary);
    check(await w.from("items").delete().eq("id", itemId).eq("trip_id", ctx.tripId));
    return { summary };
  },

  async moveItem(ctx, { itemId, direction }) {
    const item = await getItem(ctx, itemId);
    if (item.start_time) throw new EditError("Timed items are ordered by their time. Change the time to move it.");
    let q = ctx.db.from("items").select("id, type, slot, start_time, position").eq("trip_id", ctx.tripId);
    q = item.day_id ? q.eq("day_id", item.day_id) : q.is("day_id", null);
    const { data: siblings } = check(await q);
    const section = sectionOf(item);
    const peers = (siblings ?? [])
      .filter((s) => !s.start_time && (item.day_id ? sectionOf(s) === section : true))
      .sort((a, b) => compareItems(a as Item, b as Item));
    const i = peers.findIndex((p) => p.id === itemId);
    const j = direction === "earlier" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= peers.length) throw new EditError(`It's already ${direction === "earlier" ? "first" : "last"}.`);

    const summary = `Moved ${quote(item.title)} ${direction}`;
    const w = await ctx.writer(summary);
    // Swap positions; if they're equal, nudge so the order actually changes.
    const a = peers[i].position;
    let b = peers[j].position;
    if (a === b) b = direction === "earlier" ? a - 1 : a + 1;
    check(await w.from("items").update({ position: b }).eq("id", peers[i].id));
    check(await w.from("items").update({ position: a }).eq("id", peers[j].id));
    return { summary, id: itemId };
  },

  async addDay(ctx, { after }) {
    const { count } = check(await ctx.db.from("days").select("id", { count: "exact", head: true }).eq("trip_id", ctx.tripId));
    const number = Math.min(after ?? count ?? 0, count ?? 0) + 1;
    const summary = `Added Day ${number}`;
    const w = await ctx.writer(summary);
    const { data } = check(await w.rpc("add_day", { p_trip_id: ctx.tripId, p_after: after ?? undefined }));
    return { summary, id: data as string };
  },

  async removeDay(ctx, { dayId }) {
    const day = await getDay(ctx, dayId);
    const { count } = check(await ctx.db.from("items").select("id", { count: "exact", head: true }).eq("day_id", dayId));
    const moved = count ? ` and moved ${count} ${count === 1 ? "item" : "items"} to ideas` : "";
    const summary = `Removed Day ${day.number}${moved}`;
    const w = await ctx.writer(summary);
    const res = await w.rpc("remove_day", { p_day_id: dayId });
    if (res.error?.message.includes("at least one day")) throw new EditError("A trip needs at least one day.");
    check(res);
    return { summary };
  },

  async moveDay(ctx, { dayId, to }) {
    const day = await getDay(ctx, dayId);
    const summary = `Moved Day ${day.number} to Day ${to}`;
    const w = await ctx.writer(summary);
    check(await w.rpc("move_day", { p_day_id: dayId, p_to: to }));
    return { summary, id: dayId };
  },

  async updateDay(ctx, { dayId, baseCity }) {
    const day = await getDay(ctx, dayId);
    const city = baseCity || null;
    const summary = city ? `Set Day ${day.number} in ${city}` : `Cleared Day ${day.number}'s city`;
    const w = await ctx.writer(summary);
    check(await w.from("days").update({ base_city: city }).eq("id", dayId));
    return { summary, id: dayId };
  },

  async updateTrip(ctx, input) {
    const update: Database["public"]["Tables"]["trips"]["Update"] = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.destination !== undefined) update.destination = input.destination || null;
    if (input.startDate !== undefined) update.start_date = input.startDate;
    if (input.currency !== undefined) update.currency = input.currency;
    if (input.budgetTotal !== undefined) update.budget_total = input.budgetTotal;
    const summary =
      Object.keys(update).length === 1 && "start_date" in update
        ? update.start_date
          ? "Set the trip dates"
          : "Cleared the trip dates"
        : "Updated trip details";
    const w = await ctx.writer(summary);
    check(await w.from("trips").update(update).eq("id", ctx.tripId));
    return { summary };
  },
};

// ───────────────────────── Entry point ─────────────────────────

export type EditResult = { ok: true; batchId: string; summary: string; id?: string } | { ok: false; error: string };

function batchHeaders(batchId: string, actor: Actor, summary: string) {
  return {
    "x-change-batch": batchId,
    "x-change-actor": actor,
    "x-change-summary": Buffer.from(summary.slice(0, 300), "utf8").toString("base64"),
  };
}

export function editContext(tripId: string, db: ServerClient, actor: Actor, batchId: string = crypto.randomUUID()): EditContext {
  return {
    tripId,
    batchId,
    actor,
    db,
    writer: (summary) => createClient({ headers: batchHeaders(batchId, actor, summary) }),
  };
}

/** Validate and apply one edit. Errors meant for people come back as `{ ok: false }`. */
export async function applyEdit<N extends OpName>(ctx: EditContext, op: N, input: unknown): Promise<EditResult> {
  const parsed = schemas[op].safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That edit isn't valid." };
  try {
    const out = await (run[op] as (c: EditContext, i: unknown) => Promise<{ summary: string; id?: string }>)(ctx, parsed.data);
    return { ok: true, batchId: ctx.batchId, ...out };
  } catch (e) {
    if (e instanceof EditError) return { ok: false, error: e.message };
    const code = (e as { code?: string }).code;
    if (code === "42501") return { ok: false, error: "You can view this trip but not edit it." };
    console.error(`edit ${op} failed`, e);
    return { ok: false, error: "That didn't save. Try again." };
  }
}
