import "server-only";
import { dayDate, dayLabel } from "@/lib/dates";
import { findCity } from "@/lib/lookups/geocode";
import { LookupError } from "@/lib/lookups/http";
import { searchPlaces, type Coordinates } from "@/lib/lookups/places";
import { describeTravel, estimateTravel } from "@/lib/lookups/travel";
import { describeWeather, getWeather } from "@/lib/lookups/weather";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerClient } from "@/lib/supabase/server";
import { lookupSchemas, ToolInputError, type LookupName } from "./tools";

type Context = {
  supabase: ServerClient;
  tripId: string;
  trip: { destination: string | null; startDate: string | null };
  dayCities: ReadonlyMap<number, string | null>;
};

/** Where the trip is: the city a day is based in, else the trip's destination. */
async function placeFor(ctx: Context, day?: number): Promise<{ name: string; at: Coordinates } | null> {
  const name = (day ? ctx.dayCities.get(day) : null) ?? ctx.trip.destination;
  const city = name ? await findCity(name) : null;
  return city && { name: city.name, at: city };
}

/**
 * Runs a read-only lookup and returns what the model should read. Failures of
 * the outside service come back as text for the model to relay; they are not
 * thrown, because a lookup being down shouldn't end the turn.
 */
export async function runLookup(name: LookupName, raw: unknown, ctx: Context): Promise<string> {
  const parsed = lookupSchemas[name].safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ToolInputError(`Invalid input${issue?.path.length ? ` at ${issue.path.join(".")}` : ""}: ${issue?.message ?? "check the fields"}`);
  }
  try {
    switch (name) {
      case "search_places": {
        const { query, near_day } = parsed.data as { query: string; near_day?: number };
        const near = await placeFor(ctx, near_day);
        const found = await searchPlaces(query, near?.at ?? null);
        if (found.length === 0) return `No places found for "${query}"${near ? ` near ${near.name}` : ""}. Try a different name or a broader kind of place.`;
        // Stored so an item can point at it. The app server writes them (see ensure_place).
        const admin = createAdminClient();
        const lines: string[] = [];
        for (const p of found) {
          const { data, error } = await admin.rpc("ensure_place", { p_provider: p.provider, p_provider_place_id: p.providerPlaceId, p_name: p.name, p_lat: p.lat, p_lng: p.lng });
          if (error || !data) throw error ?? new Error("place not stored");
          lines.push(`- ${p.name}${p.kind ? ` (${p.kind})` : ""}${p.address ? `, ${p.address}` : ""} [place_id:${data}]`);
        }
        return `Places${near ? ` near ${near.name}` : ""} (OpenStreetMap):\n${lines.join("\n")}`;
      }
      case "get_weather": {
        const { day } = parsed.data as { day: number };
        if (!ctx.trip.startDate) return "The trip has no dates yet, so there is nothing to look the weather up for. Ask for the first day if it matters.";
        const date = dayDate(ctx.trip.startDate, day)!;
        const place = await placeFor(ctx, day);
        if (!place) return "I don't know where the trip is, so can't look up the weather. Ask for the destination first.";
        return describeWeather(await getWeather(place.at, date), place.name, dayLabel(ctx.trip.startDate, day));
      }
      case "travel_time": {
        const { from_item_id, to_item_id } = parsed.data as { from_item_id: string; to_item_id: string };
        const { data, error } = await ctx.supabase
          .from("items")
          .select("id, title, place:places(lat, lng)")
          .eq("trip_id", ctx.tripId)
          .in("id", [from_item_id, to_item_id]);
        if (error) throw error;
        const find = (id: string) => data.find((i) => i.id === id);
        const [a, b] = [find(from_item_id), find(to_item_id)];
        if (!a || !b) return "One of those items doesn't exist on this trip.";
        for (const i of [a, b]) if (i.place?.lat == null || i.place.lng == null) return `${i.title} has no place, so there's nothing to measure from. Search for it and pin it with update_item first.`;
        const estimate = estimateTravel({ lat: a.place!.lat!, lng: a.place!.lng! }, { lat: b.place!.lat!, lng: b.place!.lng! });
        return `${a.title} to ${b.title}: ${describeTravel(estimate)}. This is an estimate from distance, not a route.`;
      }
    }
  } catch (e) {
    if (e instanceof LookupError) return `Lookup failed: ${e.message} Say so plainly and carry on without it.`;
    throw e;
  }
}
