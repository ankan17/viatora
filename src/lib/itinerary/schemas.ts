import { z } from "zod";
import { tripProfileSchema } from "@/lib/trip-profile";

/** The input each itinerary op accepts. The ops themselves are in ops.ts. */

const id = z.uuid();
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30")
  .nullable();
const slot = z.enum(["morning", "afternoon", "evening", "night"]).nullable();
const title = z.string().trim().min(1, "Give it a name").max(200);
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .nullable();
const amount = z.number().nonnegative().max(10_000_000).nullable();

const itemFields = z.object({
  title,
  type: z.enum(["activity", "sight", "food", "stay", "transit", "flight", "rail", "note"]),
  dayId: id.nullable(),
  slot,
  startTime: time,
  endTime: time,
  status: z.enum(["idea", "planned", "booked"]),
  costAmount: amount,
  costCurrency: currency,
  notes: z.string().max(2000),
});

const checkTimes = (v: { startTime?: string | null; endTime?: string | null }) =>
  !v.endTime || (v.startTime != null && v.endTime > v.startTime);
const timesMessage = { message: "The end time needs a start time before it", path: ["endTime"] };

export const schemas = {
  addItem: itemFields
    .partial()
    .required({ title: true })
    .extend({ dayId: id.nullable() })
    .refine(checkTimes, timesMessage),
  updateItem: z.object({ itemId: id, patch: itemFields.partial().refine(checkTimes, timesMessage) }),
  deleteItem: z.object({ itemId: id }),
  moveItem: z.object({ itemId: id, direction: z.enum(["earlier", "later"]) }),
  addDay: z.object({ after: z.number().int().min(0).max(60).nullable().default(null) }),
  removeDay: z.object({ dayId: id }),
  moveDay: z.object({ dayId: id, to: z.number().int().min(1).max(60) }),
  updateDay: z.object({ dayId: id, baseCity: z.string().trim().max(120).nullable() }),
  updateTrip: z.object({
    name: z.string().trim().min(1, "Give it a name").max(120).optional(),
    destination: z.string().trim().max(200).nullable().optional(),
    startDate: z.iso.date().nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    budgetTotal: amount.optional(),
  }),
  /** Fields given replace what is stored; preferences are added and removed one by one. */
  updateProfile: z.object({
    travellers: tripProfileSchema.shape.travellers.unwrap().nullable().optional(),
    pace: tripProfileSchema.shape.pace.unwrap().nullable().optional(),
    interests: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    dietary: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    accessibility: z.string().trim().max(500).nullable().optional(),
    addPreferences: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
    removePreferences: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  }),
} as const;

export type OpName = keyof typeof schemas;
export type OpInput<N extends OpName> = z.input<(typeof schemas)[N]>;
export type OpOutput<N extends OpName> = z.output<(typeof schemas)[N]>;
