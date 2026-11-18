import "server-only";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { compareItems, sectionOf } from "./group";
import { readTripProfile, tripProfileSchema } from "@/lib/trip-profile";
import { schemas, type OpName, type OpOutput } from "./schemas";
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

export { schemas, type OpInput, type OpName } from "./schemas";

// ───────────────────────── Helpers ─────────────────────────

async function getItem(ctx: EditContext, itemId: string) {
  const { data, error } = await ctx.db
    .from("items")
    .select("id, day_id, title, type, slot, start_time, end_time, status, position, cost_amount, cost_currency")
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

async function tripCurrency(ctx: EditContext) {
  const { data } = check(await ctx.db.from("trips").select("currency").eq("id", ctx.tripId).maybeSingle());
  return data?.currency ?? null;
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

const run: { [N in OpName]: (ctx: EditContext, input: OpOutput<N>) => Promise<{ summary: string; id?: string }> } = {
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
          place_id: input.placeId ?? null,
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
      // A new amount keeps the item's own currency unless one is named; an item that never had a cost takes the trip's.
      update.cost_currency = patch.costAmount == null ? null : (patch.costCurrency ?? before.cost_currency ?? (await tripCurrency(ctx)));
    } else if (patch.costCurrency != null && patch.costCurrency !== before.cost_currency) {
      if (before.cost_amount == null) throw new EditError("There's no cost on that yet. Give the amount as well.");
      update.cost_currency = patch.costCurrency;
    }
    if (patch.placeId !== undefined) update.place_id = patch.placeId;
    if (patch.dayId !== undefined && patch.dayId !== before.day_id) {
      update.day_id = patch.dayId;
      update.position = await nextPosition(ctx, patch.dayId);
    }
    if (update.cost_amount != null && !update.cost_currency) throw new EditError("Pick a currency for the cost.");
    if (Object.keys(update).length === 0) throw new EditError("Nothing to change.");

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
    if ((count ?? 0) >= 60) throw new EditError("A trip can have at most 60 days.");
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
    const { count } = check(await ctx.db.from("days").select("id", { count: "exact", head: true }).eq("trip_id", ctx.tripId));
    to = Math.min(to, count ?? to); // past the end means last
    if (to === day.number) throw new EditError(`Day ${day.number} is already there.`);
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
    if (Object.keys(update).length === 0) throw new EditError("Nothing to change.");
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

  async updateProfile(ctx, input) {
    const { data } = check(await ctx.db.from("trips").select("profile").eq("id", ctx.tripId).maybeSingle());
    if (!data) throw new EditError("That trip no longer exists.");
    const before = readTripProfile(data.profile);
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const added = (input.addPreferences ?? []).filter((p) => !before.preferences.some((q) => same(p, q)));
    const dropped = input.removePreferences ?? [];

    const next = tripProfileSchema.safeParse({
      ...before,
      ...(input.travellers !== undefined && { travellers: input.travellers ?? undefined }),
      ...(input.pace !== undefined && { pace: input.pace ?? undefined }),
      ...(input.interests !== undefined && { interests: input.interests }),
      ...(input.dietary !== undefined && { dietary: input.dietary }),
      ...(input.accessibility !== undefined && { accessibility: input.accessibility || undefined }),
      preferences: [...before.preferences.filter((p) => !dropped.some((d) => same(p, d))), ...added],
    });
    if (!next.success) throw new EditError("That's more than the trip profile can hold. Remove something first.");
    // Nothing would be written or logged, so there would be nothing to undo.
    if (JSON.stringify(next.data) === JSON.stringify(before)) throw new EditError("The trip profile already says that.");

    const onlyPreferences = Object.keys(input).every((k) => k === "addPreferences" || k === "removePreferences");
    const summary =
      onlyPreferences && added.length === 1 && dropped.length === 0 ? `Noted: ${quote(added[0])}` : "Updated the trip profile";
    const w = await ctx.writer(summary);
    check(await w.from("trips").update({ profile: next.data }).eq("id", ctx.tripId));
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
    if (code === "23503")
      return { ok: false, error: "That refers to something that doesn't exist. A place_id must come from search_places." };
    console.error(`edit ${op} failed`, e);
    return { ok: false, error: "That didn't save. Try again." };
  }
}
