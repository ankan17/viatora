import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { admin, inBatch, newTrip, newUser, type Client } from "./helpers";

let user: { id: string; client: Client };
let tripId: string;
let days: { id: string; number: number }[];

async function loadDays() {
  const { data } = await user.client.from("days").select("id, number").eq("trip_id", tripId).order("number");
  return data!;
}
async function batches() {
  const { data } = await user.client.from("change_batches").select("id, actor, summary, undone_at").eq("trip_id", tripId).order("created_at");
  return data!;
}
async function undo(batchId: string, client = user.client) {
  const { data, error } = await client.rpc("undo_batch", { p_batch_id: batchId });
  if (error) throw error;
  return data;
}

beforeEach(async () => {
  user ??= await newUser();
  tripId = await newTrip(user.client, 3);
  days = await loadDays();
});

describe("logging", () => {
  it("creating a trip leaves no undoable changes", async () => {
    expect(await batches()).toEqual([]);
  });

  it("groups writes that share a batch header, with actor and summary", async () => {
    const batch = { id: randomUUID(), actor: "agent" as const, summary: "Added lunch near Nishiki Market 🍜" };
    const c = await inBatch(user.client, batch);
    await c.from("items").insert({ trip_id: tripId, day_id: days[0].id, title: "Lunch" });
    await c.from("items").insert({ trip_id: tripId, day_id: days[0].id, title: "Tea" });
    expect(await batches()).toEqual([{ id: batch.id, actor: "agent", summary: batch.summary, undone_at: null }]);
    const { data: log } = await user.client.from("change_log").select("op, entity").eq("batch_id", batch.id);
    expect(log).toEqual([
      { op: "insert", entity: "items" },
      { op: "insert", entity: "items" },
    ]);
  });

  it("gives header-less writes their own batch", async () => {
    await user.client.from("items").insert({ trip_id: tripId, title: "A" });
    await user.client.from("items").insert({ trip_id: tripId, title: "B" });
    const b = await batches();
    expect(b).toHaveLength(2);
    expect(b[0].actor).toBe("user");
  });

  it("skips updates that change nothing", async () => {
    await user.client.from("trips").update({ name: "Test trip" }).eq("id", tripId);
    expect(await batches()).toEqual([]);
  });

  it("ignores a batch id that belongs to another trip", async () => {
    const otherTrip = await newTrip(user.client, 1);
    const batch = { id: randomUUID(), summary: "x" };
    const c = await inBatch(user.client, batch);
    await c.from("items").insert({ trip_id: otherTrip, title: "Elsewhere" });
    await c.from("items").insert({ trip_id: tripId, title: "Here" });
    const { data } = await user.client.from("change_batches").select("id, trip_id").eq("trip_id", tripId);
    expect(data).toHaveLength(1);
    expect(data![0].id).not.toBe(batch.id);
  });

  it("someone else's batch id from another trip can't pull their writes into my trip", async () => {
    const mallory = await newUser();
    const myBatch = { id: randomUUID() };
    await (await inBatch(user.client, myBatch)).from("items").insert({ trip_id: tripId, title: "Mine" });
    const malloryTrip = await newTrip(mallory.client, 1);
    await (await inBatch(mallory.client, myBatch)).from("items").insert({ trip_id: malloryTrip, title: "Theirs" });
    const { count } = await admin.from("change_log").select("*", { count: "exact", head: true }).eq("batch_id", myBatch.id);
    expect(count).toBe(1);
  });
});

describe("undo", () => {
  it("reverts an insert, an update and a delete in one batch", async () => {
    const { data: keep } = await user.client.from("items").insert({ trip_id: tripId, day_id: days[0].id, title: "Keep", slot: "morning" }).select().single();
    const { data: gone } = await user.client.from("items").insert({ trip_id: tripId, day_id: days[0].id, title: "Gone", notes: "remember" }).select().single();

    const batch = { id: randomUUID(), summary: "Shuffled day 1" };
    const c = await inBatch(user.client, batch);
    await c.from("items").insert({ trip_id: tripId, title: "New" });
    await c.from("items").update({ slot: "evening", status: "planned" }).eq("id", keep!.id);
    await c.from("items").delete().eq("id", gone!.id);

    expect(await undo(batch.id)).toBe("ok");

    const { data: items } = await user.client.from("items").select("id, title, slot, status, notes").eq("trip_id", tripId).order("title");
    expect(items).toEqual([
      { id: gone!.id, title: "Gone", slot: null, status: "idea", notes: "remember" },
      { id: keep!.id, title: "Keep", slot: "morning", status: "idea", notes: "" },
    ]);
    expect((await batches()).find((b) => b.id === batch.id)?.undone_at).not.toBeNull();
    expect(await undo(batch.id)).toBe("already_undone");
  });

  it("refuses when a later change touched the same row, until that one is undone", async () => {
    const { data: item } = await user.client.from("items").insert({ trip_id: tripId, title: "Museum" }).select().single();
    const first = { id: randomUUID() };
    await (await inBatch(user.client, first)).from("items").update({ slot: "morning" }).eq("id", item!.id);
    const second = { id: randomUUID() };
    await (await inBatch(user.client, second)).from("items").update({ title: "Art museum" }).eq("id", item!.id);

    expect(await undo(first.id)).toBe("conflict");
    expect(await undo(second.id)).toBe("ok");
    expect(await undo(first.id)).toBe("ok");
    const { data } = await user.client.from("items").select("title, slot").eq("id", item!.id).single();
    expect(data).toEqual({ title: "Museum", slot: null });
  });

  it("undo itself is not logged as a new change", async () => {
    const batch = { id: randomUUID() };
    await (await inBatch(user.client, batch)).from("items").insert({ trip_id: tripId, title: "x" });
    await undo(batch.id);
    expect(await batches()).toHaveLength(1);
  });

  it("is only for editors of the trip", async () => {
    const batch = { id: randomUUID() };
    await (await inBatch(user.client, batch)).from("items").insert({ trip_id: tripId, title: "x" });
    const stranger = await newUser();
    await expect(undo(batch.id, stranger.client)).rejects.toMatchObject({ code: "P0002" });
  });
});

describe("days", () => {
  it("add_day inserts and renumbers", async () => {
    const batch = { id: randomUUID() };
    const c = await inBatch(user.client, batch);
    const { data: newId, error } = await c.rpc("add_day", { p_trip_id: tripId, p_after: 1 });
    expect(error).toBeNull();
    const after = await loadDays();
    expect(after.map((d) => d.id)).toEqual([days[0].id, newId, days[1].id, days[2].id]);
    expect(after.map((d) => d.number)).toEqual([1, 2, 3, 4]);

    expect(await undo(batch.id)).toBe("ok");
    expect(await loadDays()).toEqual(days);
  });

  it("add_day without a position appends", async () => {
    const { data: newId } = await user.client.rpc("add_day", { p_trip_id: tripId });
    expect((await loadDays()).at(-1)).toEqual({ id: newId, number: 4 });
  });

  it("remove_day sends its items to ideas and closes the gap; undo brings it all back", async () => {
    const { data: item } = await user.client
      .from("items")
      .insert({ trip_id: tripId, day_id: days[1].id, title: "Boat trip", status: "planned", slot: "afternoon" })
      .select()
      .single();
    const batch = { id: randomUUID(), summary: "Removed day 2" };
    const { error } = await (await inBatch(user.client, batch)).rpc("remove_day", { p_day_id: days[1].id });
    expect(error).toBeNull();

    expect(await loadDays()).toEqual([days[0], { id: days[2].id, number: 2 }]);
    const { data: moved } = await user.client.from("items").select("day_id, status").eq("id", item!.id).single();
    expect(moved).toEqual({ day_id: null, status: "idea" });

    expect(await undo(batch.id)).toBe("ok");
    expect(await loadDays()).toEqual(days);
    const { data: back } = await user.client.from("items").select("day_id, status").eq("id", item!.id).single();
    expect(back).toEqual({ day_id: days[1].id, status: "planned" });
  });

  it("remove_day keeps at least one day", async () => {
    const solo = await newTrip(user.client, 1);
    const { data } = await user.client.from("days").select("id").eq("trip_id", solo).single();
    const { error } = await user.client.rpc("remove_day", { p_day_id: data!.id });
    expect(error?.message).toMatch(/at least one day/);
  });

  it("move_day reorders in both directions", async () => {
    await user.client.rpc("move_day", { p_day_id: days[2].id, p_to: 1 });
    expect((await loadDays()).map((d) => d.id)).toEqual([days[2].id, days[0].id, days[1].id]);
    await user.client.rpc("move_day", { p_day_id: days[2].id, p_to: 3 });
    expect(await loadDays()).toEqual(days);
  });

  it("day RPCs respect permissions", async () => {
    const stranger = await newUser();
    const { error } = await stranger.client.rpc("add_day", { p_trip_id: tripId });
    expect(error).not.toBeNull();
    const { error: removeError } = await stranger.client.rpc("remove_day", { p_day_id: days[0].id });
    expect(removeError).not.toBeNull();
    expect(await loadDays()).toEqual(days);
  });
});

describe("integrity", () => {
  it("an item can't point at another trip's day, even through the API directly", async () => {
    const otherTrip = await newTrip(user.client, 1);
    const { data: otherDay } = await user.client.from("days").select("id").eq("trip_id", otherTrip).single();
    const insert = await user.client.from("items").insert({ trip_id: tripId, day_id: otherDay!.id, title: "Cross" });
    expect(insert.error?.code).toBe("23503");
  });
});
