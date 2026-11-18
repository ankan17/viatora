import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { admin, inBatch, newUser, type Client } from "../tests/db/helpers";

export type World = { db: Client; userId: string; tripId: string };

function ok<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error || res.data == null) throw res.error ?? new Error("No rows returned");
  return res.data;
}

export const dayIdOf = async (w: World, n: number) =>
  ok(await w.db.from("days").select("id").eq("trip_id", w.tripId).eq("number", n).single()).id;

/** A new signed-in traveller with a trip of `days` empty days. */
export async function newWorld(opts: {
  name: string;
  destination: string;
  startDate: string;
  days: number;
  budget?: number;
}): Promise<World> {
  const user = await newUser();
  const tripId = ok(
    await user.client.rpc("create_trip", {
      p_name: opts.name,
      p_destination: opts.destination,
      p_start_date: opts.startDate,
      p_day_count: opts.days,
    }),
  );
  if (opts.budget) ok(await user.client.from("trips").update({ budget_total: opts.budget }).eq("id", tripId).select("id"));
  return { db: user.client, userId: user.id, tripId };
}

type NewItem = {
  day: number | null;
  title: string;
  type: "activity" | "sight" | "food" | "stay" | "flight" | "rail" | "transit" | "note";
  slot?: "morning" | "afternoon" | "evening";
  start?: string;
  end?: string;
  status?: "idea" | "planned" | "booked";
  cost?: number;
};

export async function addItems(w: World, items: NewItem[]) {
  const days = ok(await w.db.from("days").select("id, number").eq("trip_id", w.tripId));
  const id = new Map(days.map((d) => [d.number, d.id]));
  ok(
    await w.db
      .from("items")
      .insert(
        items.map((it, i) => ({
          trip_id: w.tripId,
          day_id: it.day == null ? null : id.get(it.day)!,
          title: it.title,
          type: it.type,
          slot: it.slot ?? null,
          start_time: it.start ?? null,
          end_time: it.end ?? null,
          status: it.status ?? "planned",
          cost_amount: it.cost ?? null,
          cost_currency: it.cost ? "USD" : null,
          position: i + 1,
        })),
        { defaultToNull: false },
      )
      .select("id"),
  );
}

export async function addPacking(w: World, rows: { label: string; reason: string; category?: string; packed?: boolean }[]) {
  ok(
    await w.db
      .from("packing_items")
      .insert(
        rows.map((r, i) => ({
          trip_id: w.tripId,
          label: r.label,
          reason: r.reason,
          category: r.category ?? null,
          quantity: 1,
          packed: r.packed ?? false,
          position: i + 1,
        })),
      )
      .select("id"),
  );
}

/** The change batch and client an edit joins, as the app's server action would give it. */
export const batchClient = (w: World, batchId: string, summary: string) => inBatch(w.db, { id: batchId, actor: "agent", summary });

/** Deletes the test users' trips after a run so the local database doesn't fill up. */
export async function cleanup(worlds: World[]) {
  for (const w of worlds) await admin.auth.admin.deleteUser(w.userId).catch(() => {});
}

// --- The lookup services -----------------------------------------------------

let fake: ChildProcess | undefined;
const LOOKUP_PORT = 3199;

/** Points lookups at the scripted stand-in, so runs are repeatable and free. EVAL_LIVE_LOOKUPS=1 uses the real services. */
export async function startLookups(): Promise<void> {
  if (process.env.EVAL_LIVE_LOOKUPS) return;
  const base = `http://127.0.0.1:${LOOKUP_PORT}`;
  Object.assign(process.env, {
    PHOTON_URL: base,
    OPEN_METEO_GEOCODING_URL: base,
    OPEN_METEO_FORECAST_URL: base,
    OPEN_METEO_ARCHIVE_URL: base,
  });
  const up = () =>
    fetch(`${base}/requests`).then(
      (r) => r.ok,
      () => false,
    );
  if (await up()) return; // already running, e.g. from the Playwright server
  fake = spawn("node", ["tests/fake-model/server.mjs"], { stdio: "ignore" });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await up())) throw new Error("The scripted lookup server didn't start.");
}

export const stopLookups = () => void fake?.kill();

export const newBatchId = () => randomUUID();
