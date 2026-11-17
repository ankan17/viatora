import { endpoints, getJson } from "./http";
import type { Coordinates } from "./places";

export type City = Coordinates & { name: string; country: string | null };

type Result = { name?: string; latitude?: number; longitude?: number; country?: string };

async function search(name: string): Promise<City | null> {
  const data = await getJson<{ results?: Result[] }>(endpoints.geocoding(), "/v1/search", { name, count: 1, language: "en" });
  const hit = data.results?.[0];
  if (!hit?.name || typeof hit.latitude !== "number" || typeof hit.longitude !== "number") return null;
  return { name: hit.name, country: hit.country ?? null, lat: hit.latitude, lng: hit.longitude };
}

/**
 * Finds a city or region by name: "Kyoto", "Lisbon, Portugal". The whole phrase
 * is tried first, so "Portland, Maine" and "Trinidad and Tobago" mean what they
 * say. A destination written as a phrase ("Lisbon and the Algarve") falls back
 * to the first place named. Null when nothing matches.
 */
export async function findCity(name: string): Promise<City | null> {
  const whole = name.trim();
  if (whole.length < 2) return null;
  const found = await search(whole);
  if (found) return found;
  const first = whole.split(/,|\band\b|&|\+|\//i)[0].trim();
  return first.length >= 2 && first !== whole ? search(first) : null;
}
