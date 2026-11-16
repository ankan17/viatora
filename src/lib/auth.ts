import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's id and email, verified against the auth server's signing keys. Null when signed out. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { id: data.claims.sub, email: data.claims.email as string | undefined };
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
