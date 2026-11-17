import { endpoints, getJson } from "./http";
import type { Coordinates } from "./places";

export type City = Coordinates & { name: string; country: string | null };

type Result = { name?: string; latitude?: number; longitude?: number; country?: string };

/** Finds a city or region by name: "Kyoto", "Lisbon, Portugal". Null when nothing matches. */
export async function findCity(name: string): Promise<City | null> {
  // A trip's destination can be a phrase ("Lisbon and the Algarve"); the first place named is the one to look near.
  const first = name.split(/,|\band\b|&|\+|\//i)[0].trim();
  if (first.length < 2) return null;
  const data = await getJson<{ results?: Result[] }>(endpoints.geocoding(), "/v1/search", { name: first, count: 1, language: "en" });
  const hit = data.results?.[0];
  if (!hit?.name || typeof hit.latitude !== "number" || typeof hit.longitude !== "number") return null;
  return { name: hit.name, country: hit.country ?? null, lat: hit.latitude, lng: hit.longitude };
}
