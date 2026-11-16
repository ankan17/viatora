import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { admin, anon, newTrip, newUser, type Client } from "./helpers";

let owner: { id: string; client: Client };
let stranger: { id: string; client: Client };
let tripId: string;
let dayId: string;

beforeAll(async () => {
  owner = await newUser();
  stranger = await newUser();
  tripId = await newTrip(owner.client, 3);
  const { data } = await owner.client.from("days").select("id").eq("trip_id", tripId).eq("number", 1).single();
  dayId = data!.id;
});

describe("profiles", () => {
  it("are created on sign-up", async () => {
    const { data } = await owner.client.from("profiles").select("id, display_name").eq("id", owner.id).single();
    expect(data?.display_name).toMatch(/^test-/);
  });
});

describe("create_trip", () => {
  it("creates the trip, its days and the owner membership", async () => {
    const { data: days } = await owner.client.from("days").select("number").eq("trip_id", tripId).order("number");
    expect(days?.map((d) => d.number)).toEqual([1, 2, 3]);
    const { data: members } = await owner.client.from("trip_members").select("user_id, role").eq("trip_id", tripId);
    expect(members).toEqual([{ user_id: owner.id, role: "owner" }]);
  });

  it("rejects silly day counts", async () => {
    const { error } = await owner.client.rpc("create_trip", { p_name: "x", p_day_count: 0 });
    expect(error).not.toBeNull();
  });

  it("is not available signed out", async () => {
    const { error } = await anon().rpc("create_trip", { p_name: "x" });
    expect(error).not.toBeNull();
  });
});

describe("non-members", () => {
  it("cannot see the trip or anything in it", async () => {
    const c = stranger.client;
    const results = {
      trips: await c.from("trips").select("id").eq("id", tripId),
      days: await c.from("days").select("id").eq("trip_id", tripId),
      items: await c.from("items").select("id").eq("trip_id", tripId),
      trip_members: await c.from("trip_members").select("user_id").eq("trip_id", tripId),
    };
    for (const [table, { data }] of Object.entries(results)) expect(data, table).toEqual([]);
  });

  it("cannot add items", async () => {
    const { error } = await stranger.client.from("items").insert({ trip_id: tripId, title: "Sneaky" });
    expect(error?.code).toBe("42501");
  });

  it("cannot rename the trip", async () => {
    await stranger.client.from("trips").update({ name: "Mine now" }).eq("id", tripId);
    const { data } = await owner.client.from("trips").select("name").eq("id", tripId).single();
    expect(data?.name).toBe("Test trip");
  });

  it("cannot add themselves as a member", async () => {
    const { error } = await stranger.client.from("trip_members").insert({ trip_id: tripId, user_id: stranger.id, role: "editor" });
    expect(error?.code).toBe("42501");
  });

  it("cannot create a trip owned by someone else", async () => {
    const { error } = await stranger.client.from("trips").insert({ name: "Spoof", owner_id: owner.id });
    expect(error?.code).toBe("42501");
  });
});

describe("signed-out visitors", () => {
  it("see nothing", async () => {
    const { data, error } = await anon().from("trips").select("id");
    expect(data ?? []).toEqual([]);
    if (error) expect(error.code).toBe("42501");
  });
});

describe("roles", () => {
  it("viewers read but cannot write; editors write", async () => {
    const guest = await newUser();
    const { error: addError } = await owner.client.from("trip_members").insert({ trip_id: tripId, user_id: guest.id, role: "viewer" });
    expect(addError).toBeNull();

    const { data: seen } = await guest.client.from("days").select("id").eq("trip_id", tripId);
    expect(seen).toHaveLength(3);
    const { error: viewerWrite } = await guest.client.from("items").insert({ trip_id: tripId, day_id: dayId, title: "Lunch" });
    expect(viewerWrite?.code).toBe("42501");

    // A viewer cannot promote themselves.
    await guest.client.from("trip_members").update({ role: "editor" }).eq("trip_id", tripId).eq("user_id", guest.id);
    const { data: still } = await owner.client.from("trip_members").select("role").eq("trip_id", tripId).eq("user_id", guest.id).single();
    expect(still?.role).toBe("viewer");

    await owner.client.from("trip_members").update({ role: "editor" }).eq("trip_id", tripId).eq("user_id", guest.id);
    const { error: editorWrite } = await guest.client.from("items").insert({ trip_id: tripId, day_id: dayId, title: "Lunch" });
    expect(editorWrite).toBeNull();

    // Only the owner deletes the trip.
    const { data: deleted } = await guest.client.from("trips").delete().eq("id", tripId).select("id");
    expect(deleted).toEqual([]);
  });
});

describe("items", () => {
  it("enforce time-or-slot and cost currency", async () => {
    const bad1 = await owner.client.from("items").insert({ trip_id: tripId, title: "x", start_time: "09:00", slot: "morning" });
    expect(bad1.error?.code).toBe("23514");
    const bad2 = await owner.client.from("items").insert({ trip_id: tripId, title: "x", cost_amount: 10 });
    expect(bad2.error?.code).toBe("23514");
  });

  it("without a day sit in the ideas backlog", async () => {
    const { data, error } = await owner.client.from("items").insert({ trip_id: tripId, title: "Day trip to Sintra" }).select("day_id, status").single();
    expect(error).toBeNull();
    expect(data).toEqual({ day_id: null, status: "idea" });
  });
});

describe("change_log", () => {
  it("cannot be written or rewritten by clients", async () => {
    const entry = { trip_id: tripId, batch_id: randomUUID(), entity: "items", entity_id: randomUUID(), op: "insert" as const, after: {} };
    const insert = await owner.client.from("change_log").insert(entry);
    expect(insert.error?.code).toBe("42501");
    const batch = await owner.client.from("change_batches").insert({ id: randomUUID(), trip_id: tripId });
    expect(batch.error?.code).toBe("42501");
  });
});

describe("places", () => {
  it("store only the ID for Google, and never overwrite an existing place", async () => {
    const gid = `g-${randomUUID()}`;
    const { data: id1 } = await owner.client.rpc("ensure_place", { p_provider: "google", p_provider_place_id: gid, p_name: "Leak", p_lat: 1, p_lng: 2 });
    const { data: row } = await owner.client.from("places").select("name, lat, lng").eq("id", id1!).single();
    expect(row).toEqual({ name: null, lat: null, lng: null });

    const oid = `o-${randomUUID()}`;
    const { data: a } = await owner.client.rpc("ensure_place", { p_provider: "overture", p_provider_place_id: oid, p_name: "Real name", p_lat: 38.7, p_lng: -9.1 });
    const { data: b } = await stranger.client.rpc("ensure_place", { p_provider: "overture", p_provider_place_id: oid, p_name: "Vandalised" });
    expect(b).toBe(a);
    const { data: kept } = await owner.client.from("places").select("name").eq("id", a!).single();
    expect(kept?.name).toBe("Real name");
  });

  it("cannot be inserted directly", async () => {
    const { error } = await owner.client.from("places").insert({ provider: "custom", provider_place_id: randomUUID(), name: "x" });
    expect(error?.code).toBe("42501");
  });
});

describe("cleanup", () => {
  it("deleting a trip removes everything in it", async () => {
    const id = await newTrip(owner.client, 2);
    await owner.client.from("items").insert({ trip_id: id, title: "x" });
    const { error } = await owner.client.from("trips").delete().eq("id", id);
    expect(error).toBeNull();
    const { count } = await admin.from("days").select("*", { count: "exact", head: true }).eq("trip_id", id);
    expect(count).toBe(0);
  });
});
