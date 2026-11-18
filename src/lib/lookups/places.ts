import type { ItemType } from "@/lib/itinerary/types";
import { endpoints, getJson } from "./http";

export type Coordinates = { lat: number; lng: number };

/** A place as a provider describes it, before it is stored. */
export type FoundPlace = Coordinates & {
  provider: "osm";
  providerPlaceId: string;
  name: string;
  /** What it is, in plain words: "restaurant", "museum". */
  kind: string | null;
  address: string | null;
};

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

// Roads and borders match many searches by name but are nowhere to go.
const NOT_A_DESTINATION = new Set(["highway", "boundary", "waterway"]);

/**
 * Searches for places by name or kind ("ramen", "Fushimi Inari"), preferring
 * ones near a point. The data is OpenStreetMap's: names and locations, no
 * ratings, opening hours or prices.
 */
export async function searchPlaces(query: string, near: Coordinates | null, limit = 5): Promise<FoundPlace[]> {
  const data = await getJson<{ features?: PhotonFeature[] }>(endpoints.places(), "/api", {
    q: query,
    lang: "en",
    limit: limit * 2, // some are dropped below
    lat: near?.lat,
    lon: near?.lng,
  });
  const places: FoundPlace[] = [];
  for (const { geometry, properties: p } of data.features ?? []) {
    const [lng, lat] = geometry?.coordinates ?? [];
    if (!p?.name || !p.osm_id || !p.osm_type || typeof lat !== "number" || typeof lng !== "number") continue;
    if (NOT_A_DESTINATION.has(p.osm_key ?? "")) continue;
    const street = [p.street, p.housenumber].filter(Boolean).join(" ");
    places.push({
      provider: "osm",
      providerPlaceId: `${p.osm_type}${p.osm_id}`,
      name: p.name,
      kind: p.osm_value && p.osm_value !== "yes" ? p.osm_value.replaceAll("_", " ") : null,
      address: [street, p.district, p.city, p.country].filter(Boolean).join(", ") || null,
      lat,
      lng,
    });
    if (places.length === limit) break;
  }
  return places;
}

const KINDS: [ItemType, string[]][] = [
  ["food", ["restaurant", "cafe", "bar", "pub", "fast food", "food court", "ice cream", "bakery", "biergarten", "izakaya"]],
  ["stay", ["hotel", "hostel", "guest house", "motel", "apartment", "chalet", "camp site"]],
  ["transit", ["station", "bus station", "ferry terminal", "aerodrome", "stop", "halt", "tram stop", "subway entrance"]],
  [
    "sight",
    [
      "museum",
      "attraction",
      "viewpoint",
      "place of worship",
      "castle",
      "monument",
      "memorial",
      "gallery",
      "artwork",
      "ruins",
      "zoo",
      "theme park",
      "park",
      "garden",
    ],
  ],
];

/** The kind of itinerary item a place most likely is. */
export function itemTypeFor(kind: string | null): ItemType {
  return KINDS.find(([, names]) => kind && names.includes(kind))?.[0] ?? "activity";
}
