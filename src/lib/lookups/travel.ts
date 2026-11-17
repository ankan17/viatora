import type { Coordinates } from "./places";

/**
 * Travel time between two points, estimated from the straight-line distance.
 * It knows nothing of rivers, hills or timetables, so it is only good for
 * "is this a five-minute walk or across town". Real routes come with a
 * directions provider.
 */
export type TravelEstimate = { km: number; walkMinutes: number; transitMinutes: number; driveMinutes: number };

const EARTH_KM = 6371;
// Streets don't run straight: a route is roughly this much longer than the line.
const DETOUR = 1.3;

export function distanceKm(a: Coordinates, b: Coordinates): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

export function estimateTravel(from: Coordinates, to: Coordinates): TravelEstimate {
  const km = distanceKm(from, to) * DETOUR;
  const minutes = (kmh: number, overhead: number) => Math.max(1, Math.round((km / kmh) * 60 + overhead));
  return {
    km: Math.round(km * 10) / 10,
    walkMinutes: minutes(4.5, 0),
    // City speeds, door to door: waiting for a train or bus, finding the car and parking it.
    transitMinutes: minutes(20, 8),
    driveMinutes: minutes(25, 6),
  };
}

/** The quickest sensible way: on foot when it's close, otherwise transit or a car. */
export function quickestMinutes(e: TravelEstimate): number {
  return Math.min(e.walkMinutes, e.transitMinutes, e.driveMinutes);
}

export function describeTravel(e: TravelEstimate): string {
  const distance = e.km < 1 ? `${Math.round(e.km * 100) * 10} m` : `${e.km} km`;
  if (e.walkMinutes <= 20) return `about ${e.walkMinutes} min on foot (${distance})`;
  return `about ${e.transitMinutes} min by public transport or ${e.driveMinutes} min by car (${distance}; ${e.walkMinutes} min on foot)`;
}
