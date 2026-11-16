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

/** Parse a stored profile, dropping anything invalid instead of failing the page. */
export function readTripProfile(value: unknown): TripProfile {
  const parsed = tripProfileSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : tripProfileSchema.parse({});
}
