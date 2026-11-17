import { endpoints, getJson, LookupError } from "./http";
import type { Coordinates } from "./places";

export type Weather =
  | { kind: "forecast"; date: string; high: number; low: number; rainChance: number | null; sky: string }
  /** Too far ahead (or in the past) for a forecast: what the same week was like in recent years. */
  | { kind: "typical"; date: string; high: number; low: number; wetDaysInTen: number | null; years: string; inPast: boolean };

type Daily = {
  time?: string[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  precipitation_sum?: (number | null)[];
  precipitation_probability_max?: (number | null)[];
  weather_code?: (number | null)[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const FORECAST_DAYS = 16;
const iso = (d: Date) => d.toISOString().slice(0, 10);

// WMO weather interpretation codes, as Open-Meteo reports them.
function sky(code: number | null | undefined): string {
  if (code == null) return "no description";
  if (code === 0) return "clear";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain showers";
  if (code <= 86) return "snow showers";
  return "thunderstorms";
}

/**
 * The weather for a calendar date ("YYYY-MM-DD") at a place: a forecast when
 * the date is within reach of one, otherwise what that week has been like over
 * the last five years. `today` is passed in so the choice can be tested.
 */
export async function getWeather(at: Coordinates, date: string, today: Date = new Date()): Promise<Weather> {
  const daysAway = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${iso(today)}T00:00:00Z`)) / DAY_MS);
  if (Number.isNaN(daysAway)) throw new LookupError("That isn't a date.");
  const where = { latitude: at.lat, longitude: at.lng, timezone: "auto" };

  if (daysAway >= 0 && daysAway < FORECAST_DAYS) {
    const { daily } = await getJson<{ daily?: Daily }>(endpoints.forecast(), "/v1/forecast", {
      ...where,
      start_date: date,
      end_date: date,
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    });
    const high = daily?.temperature_2m_max?.[0];
    const low = daily?.temperature_2m_min?.[0];
    if (high == null || low == null) throw new LookupError("There's no forecast for that day yet.");
    return { kind: "forecast", date, high: Math.round(high), low: Math.round(low), rainChance: daily?.precipitation_probability_max?.[0] ?? null, sky: sky(daily?.weather_code?.[0]) };
  }

  // The week around the same date in each of five recent years, leaving out any
  // whose week is too recent for the archive to have filled in.
  const [, month, day] = date.split("-").map(Number);
  const window = (year: number) => {
    const centre = Date.UTC(year, month - 1, day);
    return { start: iso(new Date(centre - 3 * DAY_MS)), end: iso(new Date(centre + 3 * DAY_MS)), endMs: centre + 3 * DAY_MS };
  };
  const settled = Date.parse(`${iso(today)}T00:00:00Z`) - 10 * DAY_MS;
  const years = Array.from({ length: 7 }, (_, i) => today.getUTCFullYear() - i)
    .filter((year) => window(year).endMs <= settled)
    .slice(0, 5);
  const results = await Promise.allSettled(
    years.map((year) =>
      getJson<{ daily?: Daily }>(endpoints.archive(), "/v1/archive", {
        ...where,
        start_date: window(year).start,
        end_date: window(year).end,
        daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
      }),
    ),
  );
  const weeks = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (weeks.length === 0 && results.length > 0) throw new LookupError("The weather record isn't available right now.");
  const all = (pick: (d: Daily) => (number | null)[] | undefined) => weeks.flatMap((w) => (w.daily ? (pick(w.daily) ?? []) : [])).filter((v): v is number => v != null);
  const highs = all((d) => d.temperature_2m_max);
  const lows = all((d) => d.temperature_2m_min);
  const rain = all((d) => d.precipitation_sum);
  if (highs.length === 0 || lows.length === 0) throw new LookupError("There's no weather record for that place.");
  const mean = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return {
    kind: "typical",
    date,
    high: mean(highs),
    low: mean(lows),
    // A day counts as wet from 1 mm of rain.
    wetDaysInTen: rain.length ? Math.round((rain.filter((mm) => mm >= 1).length / rain.length) * 10) : null,
    years: `${years.at(-1)} to ${years[0]}`,
    inPast: daysAway < 0,
  };
}

export function describeWeather(w: Weather, place: string, dayLabel: string): string {
  if (w.kind === "forecast") {
    const rain = w.rainChance == null ? "" : `, ${w.rainChance}% chance of rain`;
    return `Forecast for ${place} on ${dayLabel}: ${w.sky}, high ${w.high}°C, low ${w.low}°C${rain}. Source: Open-Meteo.`;
  }
  const rain = w.wetDaysInTen == null ? "" : `, with rain on about ${w.wetDaysInTen} days in 10`;
  const lead = w.inPast ? `That day has passed. In ${place} that week was typically` : `Too far from ${dayLabel} for a forecast. In ${place} that week is typically`;
  return `${lead} ${w.high}°C by day and ${w.low}°C at night${rain} (${w.years}). Source: Open-Meteo historical data.`;
}
