import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { inBatch, newTrip, newUser, type Client } from "./helpers";

let owner: { id: string; client: Client };
let viewer: { id: string; client: Client };
let stranger: { id: string; client: Client };
let tripId: string;

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([newUser(), newUser(), newUser()]);
  tripId = await newTrip(owner.client, 2);
  await owner.client.from("trip_members").insert({ trip_id: tripId, user_id: viewer.id, role: "viewer" });
});

const writes = (c: Client) => ({
  packing: () => c.from("packing_items").insert({ trip_id: tripId, label: "Sun hat" }),
  booking: () => c.from("bookings").insert({ trip_id: tripId, kind: "stay", title: "Hotel" }),
  ruledOut: () => c.from("ruled_out").insert({ trip_id: tripId, label: "Night buses" }),
});

describe("packing, bookings and ruled-out options", () => {
  it("are written by editors only, and read by members only", async () => {
    for (const [name, write] of Object.entries(writes(viewer.client))) expect((await write()).error?.code, `viewer ${name}`).toBe("42501");
    for (const [name, write] of Object.entries(writes(stranger.client)))
      expect((await write()).error?.code, `stranger ${name}`).toBe("42501");
    for (const [name, write] of Object.entries(writes(owner.client))) expect((await write()).error, `owner ${name}`).toBeNull();

    for (const table of ["packing_items", "bookings", "ruled_out"] as const) {
      expect((await viewer.client.from(table).select("id").eq("trip_id", tripId)).data, `viewer reads ${table}`).toHaveLength(1);
      expect((await stranger.client.from(table).select("id").eq("trip_id", tripId)).data, `stranger reads ${table}`).toEqual([]);
    }
    // A viewer's update changes nothing.
    await viewer.client.from("packing_items").update({ packed: true }).eq("trip_id", tripId);
    expect((await owner.client.from("packing_items").select("packed").eq("trip_id", tripId)).data).toEqual([{ packed: false }]);
  });

  it("enforce their own rules", async () => {
    const c = owner.client;
    expect((await c.from("packing_items").insert({ trip_id: tripId, label: "x", quantity: 0 })).error?.code).toBe("23514");
    expect((await c.from("packing_items").insert({ trip_id: tripId, label: "" })).error?.code).toBe("23514");
    expect((await c.from("bookings").insert({ trip_id: tripId, kind: "car", title: "x", cost_amount: 10 })).error?.code).toBe("23514");
    const backwards = await c
      .from("bookings")
      .insert({ trip_id: tripId, kind: "car", title: "x", starts_at: "2027-04-03T10:00", ends_at: "2027-04-03T09:00" });
    expect(backwards.error?.code).toBe("23514");
  });

  it("are logged as one batch that undoes together", async () => {
    const batchId = randomUUID();
    const w = await inBatch(owner.client, { id: batchId, actor: "agent", summary: "Added 2 things to the packing list" });
    const { data, error } = await w
      .from("packing_items")
      .insert([
        { trip_id: tripId, label: "Rain jacket", reason: "Showers", position: 10 },
        { trip_id: tripId, label: "Adapter", reason: "", position: 11 },
      ])
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(2);

    const labels = async () => (await owner.client.from("packing_items").select("label").eq("trip_id", tripId)).data!.map((r) => r.label);
    expect(await labels()).toContain("Rain jacket");

    const undone = await owner.client.rpc("undo_batch", { p_batch_id: batchId });
    expect(undone.data).toBe("ok");
    expect(await labels()).not.toContain("Rain jacket");
    expect(await labels()).not.toContain("Adapter");
  });

  it("bring a deleted booking back when the change is undone", async () => {
    const { data: b } = await owner.client
      .from("bookings")
      .insert({ trip_id: tripId, kind: "flight", title: "LHR to KIX", confirmation_ref: "ABC123" })
      .select("id")
      .single();
    const batchId = randomUUID();
    const w = await inBatch(owner.client, { id: batchId, summary: "Removed the booking" });
    expect((await w.from("bookings").delete().eq("id", b!.id)).error).toBeNull();
    expect((await owner.client.from("bookings").select("id").eq("id", b!.id)).data).toEqual([]);

    expect((await owner.client.rpc("undo_batch", { p_batch_id: batchId })).data).toBe("ok");
    const { data: back } = await owner.client.from("bookings").select("title, confirmation_ref").eq("id", b!.id).single();
    expect(back).toEqual({ title: "LHR to KIX", confirmation_ref: "ABC123" });
  });
});
