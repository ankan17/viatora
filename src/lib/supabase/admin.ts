import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseUrl } from "@/lib/env";

/**
 * A client that bypasses row level security. Only for writes that must not be
 * possible from a browser: storing the assistant's replies and the places a search finds. Everything
 * else goes through the signed-in user's client.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing environment variable SUPABASE_SECRET_KEY. See .env.example.");
  return createClient<Database>(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
