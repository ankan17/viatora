import { afterEach, describe, expect, it, vi } from "vitest";
import { findCity } from "./geocode";
import { LookupError } from "./http";
import { itemTypeFor, searchPlaces } from "./places";
import { describeTravel, distanceKm, estimateTravel } from "./travel";
import { describeWeather, getWeather } from "./weather";

/** Answers each fetch with the next body; records the URLs asked for. */
function respond(...bodies: unknown[]) {
  const urls: URL[] = [];
  const queue = [...bodies];
  vi.stubGlobal("fetch", async (url: URL) => {
    urls.push(url);
    const body = queue.length > 1 ? queue.shift() : queue[0];
    return new Response(JSON.stringify(body), { status: body === "fail" ? 500 : 200 });
  });
  return urls;
}
afterEach(() => vi.unstubAllGlobals());

const KYOTO = { lat: 35.01, lng: 135.77 };
const feature = (o: Record<string, unknown>, coordinates: unknown = [135.77, 35.0]) => ({ geometry: { coordinates }, properties: { osm_id: 1, osm_type: "N", osm_key: "amenity", osm_value: "restaurant", name: "Ichiran", ...o } });

describe("place search", () => {
  it("reads Photon's results, with longitude first, and biases toward a point", async () => {
    const urls = respond({ features: [feature({ street: "Kawaramachi", housenumber: "5", city: "Kyoto", country: "Japan" })] });
    const [place] = await searchPlaces("ramen", KYOTO);
    expect(place).toEqual({ provider: "osm", providerPlaceId: "N1", name: "Ichiran", kind: "restaurant", address: "Kawaramachi 5, Kyoto, Japan", lat: 35.0, lng: 135.77 });
    expect(urls[0].searchParams.get("q")).toBe("ramen");
    expect(urls[0].searchParams.get("lat")).toBe("35.01");
    expect(urls[0].searchParams.get("lon")).toBe("135.77");
  });

  it("skips results it can't use: no name, no coordinates, roads and borders", async () => {
    respond({
      features: [
        feature({ name: undefined }),
        feature({ name: "Highway", osm_key: "highway" }),
        feature({ osm_id: 2, name: "Nowhere" }, []),
        feature({ osm_id: 3, name: "Keep", osm_value: "yes" }),
      ],
    });
    expect((await searchPlaces("x", null)).map((p) => [p.name, p.kind])).toEqual([["Keep", null]]);
  });

  it("stops at the limit, and an empty answer is an empty list", async () => {
    respond({ features: Array.from({ length: 10 }, (_, i) => feature({ osm_id: i + 1, name: `P${i}` })) });
    expect(await searchPlaces("x", null, 3)).toHaveLength(3);
    respond({});
    expect(await searchPlaces("x", null)).toEqual([]);
  });

  it("turns an outage into a lookup error the model can relay", async () => {
    respond("fail");
    await expect(searchPlaces("x", null)).rejects.toThrow(LookupError);
  });

  it("maps kinds of place onto kinds of item", () => {
    expect([itemTypeFor("cafe"), itemTypeFor("museum"), itemTypeFor("hotel"), itemTypeFor("station"), itemTypeFor("playground"), itemTypeFor(null)]).toEqual(["food", "sight", "stay", "transit", "activity", "activity"]);
  });
});

describe("finding a city", () => {
  it("uses the first place named in a destination phrase", async () => {
    const urls = respond({ results: [{ name: "Lisbon", latitude: 38.7, longitude: -9.1, country: "Portugal" }] });
    expect(await findCity("Lisbon and the Algarve")).toEqual({ name: "Lisbon", country: "Portugal", lat: 38.7, lng: -9.1 });
    expect(urls[0].searchParams.get("name")).toBe("Lisbon");
  });
  it("says null when nothing matches", async () => {
    respond({});
    expect(await findCity("Nowhereville")).toBeNull();
    expect(await findCity("x")).toBeNull();
  });
});

describe("travel estimates", () => {
  it("measures the distance between two points", () => {
    expect(distanceKm({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 })).toBeCloseTo(343.5, 0);
  });
  it("calls a short hop a walk and a long one a ride", () => {
    const near = estimateTravel({ lat: 35.0, lng: 135.77 }, { lat: 35.004, lng: 135.77 });
    expect(describeTravel(near)).toMatch(/^about \d+ min on foot \(\d+ m\)$/);
    const far = estimateTravel({ lat: 35.0, lng: 135.77 }, { lat: 35.1, lng: 135.77 });
    expect(describeTravel(far)).toMatch(/by public transport or \d+ min by car/);
    expect(far.walkMinutes).toBeGreaterThan(far.transitMinutes);
  });
});

describe("weather", () => {
  const today = new Date("2027-03-01T10:00:00Z");

  it("gives a forecast for a day within reach", async () => {
    const urls = respond({ daily: { temperature_2m_max: [21.4], temperature_2m_min: [11.2], precipitation_probability_max: [30], weather_code: [2] } });
    const w = await getWeather(KYOTO, "2027-03-10", today);
    expect(w).toEqual({ kind: "forecast", date: "2027-03-10", high: 21, low: 11, rainChance: 30, sky: "partly cloudy" });
    expect(urls[0].pathname).toBe("/v1/forecast");
    expect(describeWeather(w, "Kyoto", "Wed 10 Mar")).toBe("Forecast for Kyoto on Wed 10 Mar: partly cloudy, high 21°C, low 11°C, 30% chance of rain. Source: Open-Meteo.");
  });

  it("falls back to what the week is usually like when it is too far ahead", async () => {
    const urls = respond({ daily: { temperature_2m_max: [20, 18, 22], temperature_2m_min: [10, 8, 9], precipitation_sum: [0, 2, 0] } });
    const w = await getWeather(KYOTO, "2027-04-05", today);
    expect(w).toEqual({ kind: "typical", date: "2027-04-05", high: 20, low: 9, wetDaysInTen: 3, years: "2022 to 2026" });
    expect(urls).toHaveLength(5);
    expect(urls[0].pathname).toBe("/v1/archive");
    expect(urls[0].searchParams.get("start_date")).toBe("2026-04-02");
    expect(urls[0].searchParams.get("end_date")).toBe("2026-04-08");
    expect(describeWeather(w, "Kyoto", "Mon 5 Apr")).toContain("typically 20°C by day and 9°C at night, with rain on about 3 days in 10 (2022 to 2026)");
  });

  it("uses the record for a date that has passed, and for the 16th day out", async () => {
    respond({ daily: { temperature_2m_max: [5], temperature_2m_min: [1], precipitation_sum: [0] } });
    expect((await getWeather(KYOTO, "2027-02-01", today)).kind).toBe("typical");
    expect((await getWeather(KYOTO, "2027-03-17", today)).kind).toBe("typical");
  });

  it("reports a missing forecast or record instead of inventing one", async () => {
    respond({ daily: {} });
    await expect(getWeather(KYOTO, "2027-03-02", today)).rejects.toThrow("no forecast");
    await expect(getWeather(KYOTO, "2027-06-01", today)).rejects.toThrow("no weather record");
    await expect(getWeather(KYOTO, "soon", today)).rejects.toThrow("isn't a date");
  });
});
