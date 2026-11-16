import { z } from "zod";

/**
 * The trip profile stored in trips.profile (jsonb). The agent reads it every
 * turn and writes to it whenever the group states something that matters later.
 */
export const tripProfileSchema = z.object({
  travellers: z
    .object({
      adults: z.number().int().min(1).max(30),
      childAges: z.array(z.number().int().min(0).max(17)).max(20).default([]),
    })
    .optional(),
  pace: z.enum(["relaxed", "balanced", "packed"]).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  dietary: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  accessibility: z.string().trim().max(500).optional(),
  /** Free-form preferences saved from chat, e.g. "No early starts". */
  preferences: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
});

export type TripProfile = z.infer<typeof tripProfileSchema>;

/**
 * Parse a stored profile. A field that doesn't fit the schema is dropped on its
 * own, so one bad value neither fails the page nor wipes the rest on the next save.
 */
export function readTripProfile(value: unknown): TripProfile {
  const whole = tripProfileSchema.safeParse(value ?? {});
  if (whole.success) return whole.data;
  const stored = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const kept: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(tripProfileSchema.shape)) {
    if (stored[key] !== undefined && field.safeParse(stored[key]).success) kept[key] = stored[key];
  }
  return tripProfileSchema.parse(kept);
}
