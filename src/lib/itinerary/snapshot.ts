import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import type { Itinerary } from "./types";

const ITEM_FIELDS =
  "id, day_id, type, title, start_time, end_time, slot, position, status, cost_amount, cost_currency, notes, url, place:places(name)";

/** Loads a trip's whole itinerary, or null if it doesn't exist or isn't shared with this user. */
export async function loadItinerary(supabase: ServerClient, tripId: string): Promise<Itinerary | null> {
  const [tripRes, daysRes, itemsRes, roleRes] = await Promise.all([
    supabase.from("trips").select("id, name, destination, start_date, currency, budget_total").eq("id", tripId).maybeSingle(),
    supabase.from("days").select("id, number, base_city, notes").eq("trip_id", tripId).order("number"),
    supabase.from("items").select(ITEM_FIELDS).eq("trip_id", tripId).order("position"),
    supabase.rpc("can_edit_trip", { p_trip_id: tripId }),
  ]);
  for (const r of [tripRes, daysRes, itemsRes]) if (r.error) throw r.error;
  if (!tripRes.data) return null;

  const items = itemsRes.data ?? [];
  return {
    trip: tripRes.data,
    days: (daysRes.data ?? []).map((d) => ({ ...d, items: items.filter((i) => i.day_id === d.id) })),
    ideas: items.filter((i) => i.day_id === null),
    canEdit: roleRes.data === true,
  };
}
