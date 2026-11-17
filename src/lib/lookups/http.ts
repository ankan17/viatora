/**
 * Where lookups go. Each can be pointed elsewhere by environment variable:
 * tests use a local stand-in, and a deployment can use its own instance.
 */
export const endpoints = {
  /** Place search over OpenStreetMap data (Photon). */
  places: () => process.env.PHOTON_URL ?? "https://photon.komoot.io",
  /** City lookup, forecast and past weather (Open-Meteo). */
  geocoding: () => process.env.OPEN_METEO_GEOCODING_URL ?? "https://geocoding-api.open-meteo.com",
  forecast: () => process.env.OPEN_METEO_FORECAST_URL ?? "https://api.open-meteo.com",
  archive: () => process.env.OPEN_METEO_ARCHIVE_URL ?? "https://archive-api.open-meteo.com",
};

/** A lookup that didn't work, with a message fit to hand to the model. */
export class LookupError extends Error {}

export async function getJson<T>(base: string, path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": process.env.LOOKUP_USER_AGENT ?? "viatora-trip-planner" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) throw new LookupError(`The lookup service returned an error (${res.status}).`);
    // The timeout covers reading the body too, and a proxy's error page isn't JSON.
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof LookupError) throw e;
    throw new LookupError("The lookup service didn't answer properly.");
  }
}
