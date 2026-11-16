import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secret = process.env.SUPABASE_SECRET_KEY!;
if (!url.includes("127.0.0.1") && !url.includes("localhost")) throw new Error("DB tests only run against local Supabase");

export type Client = SupabaseClient<Database>;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = createClient<Database>(url, secret, opts);
export const anon = (): Client => createClient<Database>(url, key, opts);

/** A fresh confirmed user, signed in. */
export async function newUser(): Promise<{ id: string; client: Client }> {
  const email = `test-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = anon();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

export type Batch = { id: string; actor?: "user" | "agent"; summary?: string };

export function batchHeaders(batch: Batch): Record<string, string> {
  return {
    "x-change-batch": batch.id,
    "x-change-actor": batch.actor ?? "user",
    "x-change-summary": Buffer.from(batch.summary ?? "", "utf8").toString("base64"),
  };
}

/** The same signed-in user, with every request joining `batch`. */
export async function inBatch(user: Client, batch: Batch): Promise<Client> {
  const { data } = await user.auth.getSession();
  const client = createClient<Database>(url, key, { ...opts, global: { headers: batchHeaders(batch) } });
  await client.auth.setSession({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token });
  return client;
}

export async function newTrip(client: Client, days = 3) {
  const { data, error } = await client.rpc("create_trip", { p_name: "Test trip", p_day_count: days });
  if (error) throw error;
  return data;
}
