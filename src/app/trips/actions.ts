"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NewTripState = { error?: string; fields?: Record<string, string> };

const newTrip = z.object({
  name: z.string().trim().min(1, "Give the trip a name.").max(120),
  destination: z.string().trim().max(200).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  days: z.coerce.number().int().min(1, "A trip needs at least one day.").max(60, "Up to 60 days for now."),
});

export async function createTrip(_prev: NewTripState, form: FormData): Promise<NewTripState> {
  await requireUser();
  const fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = newTrip.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details and try again.", fields };

  const supabase = await createClient();
  const { data: tripId, error } = await supabase.rpc("create_trip", {
    p_name: parsed.data.name,
    p_destination: parsed.data.destination || undefined,
    p_start_date: parsed.data.startDate,
    p_day_count: parsed.data.days,
  });
  if (error || !tripId) return { error: "We couldn't create the trip. Try again.", fields };

  redirect(`/trips/${tripId}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
