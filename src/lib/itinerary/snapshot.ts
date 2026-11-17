import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import type { Itinerary } from "./types";

const ITEM_FIELDS =
  "id, day_id, type, title, start_time, end_time, slot, position, status, cost_amount, cost_currency, notes, url, place:places(name)";

/** Loads a trip's whole itinerary, or null if it doesn't exist or isn't shared with this user. */
export async function loadItinerary(supabase: ServerClient, tripId: string): Promise<Itinerary | null> {
  const [tripRes, daysRes, itemsRes, roleRes, packingRes, bookingsRes, ruledOutRes] = await Promise.all([
    supabase.from("trips").select("id, name, destination, start_date, currency, budget_total, profile").eq("id", tripId).maybeSingle(),
    supabase.from("days").select("id, number, base_city, notes").eq("trip_id", tripId).order("number"),
    supabase.from("items").select(ITEM_FIELDS).eq("trip_id", tripId).order("position"),
    supabase.rpc("can_edit_trip", { p_trip_id: tripId }),
    supabase
      .from("packing_items")
      .select("id, label, reason, category, quantity, packed, position")
      .eq("trip_id", tripId)
      .order("position")
      .order("created_at"),
    supabase
      .from("bookings")
      .select("id, kind, title, provider_name, confirmation_ref, starts_at, ends_at, cost_amount, cost_currency, status, url, notes")
      .eq("trip_id", tripId)
      .order("starts_at", { nullsFirst: false })
      .order("created_at"),
    supabase.from("ruled_out").select("id, label, reason").eq("trip_id", tripId).order("created_at"),
  ]);
  for (const r of [tripRes, daysRes, itemsRes, packingRes, bookingsRes, ruledOutRes]) if (r.error) throw r.error;
  if (!tripRes.data) return null;

  const items = itemsRes.data ?? [];
  return {
    trip: tripRes.data,
    days: (daysRes.data ?? []).map((d) => ({
      ...d,
      items: items.filter((i) => i.day_id === d.id),
    })),
    ideas: items.filter((i) => i.day_id === null),
    packing: packingRes.data ?? [],
    bookings: bookingsRes.data ?? [],
    ruledOut: ruledOutRes.data ?? [],
    canEdit: roleRes.data === true,
  };
}
