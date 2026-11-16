import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "@/lib/database.types";
import { supabaseKey, supabaseUrl } from "@/lib/env";

/** Supabase client for Server Components, Server Actions and Route Handlers. Acts as the signed-in user. */
export async function createClient(options: { headers?: Record<string, string> } = {}) {
  // Everything read through this client is per-user and per-request, so it must
  // never be prerendered (supabase-js also reads the clock for token expiry).
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    global: options.headers ? { headers: options.headers } : undefined,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;
