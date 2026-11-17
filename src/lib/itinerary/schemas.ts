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

const label = (max: number) => z.string().trim().min(1, "Give it a name").max(max);
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "Use a web address that starts with http:// or https://");
/** A local date and time as written, "2027-04-03" or "2027-04-03T14:30". Kept as typed, with no timezone conversion. */
const when = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/, "Use a date like 2027-04-03, with a time like 2027-04-03T14:30 if you have one");

const packingFields = z.object({
  label: label(120),
  reason: z.string().trim().max(300),
  category: z.string().trim().max(60).nullable(),
  quantity: z.number().int().min(1).max(99),
});

const bookingFields = z.object({
  kind: z.enum(["stay", "flight", "rail", "activity", "car", "other"]),
  title: title,
  providerName: z.string().trim().max(120).nullable(),
  confirmationRef: z.string().trim().max(120).nullable(),
  startsAt: when.nullable(),
  endsAt: when.nullable(),
  status: z.enum(["pending", "confirmed", "cancelled"]),
  costAmount: amount,
  costCurrency: currency,
  url: httpUrl.nullable(),
  notes: z.string().max(2000),
});
const checkDates = (v: { startsAt?: string | null; endsAt?: string | null }) => !v.startsAt || !v.endsAt || v.endsAt >= v.startsAt;
const datesMessage = {
  message: "It can't end before it starts",
  path: ["endsAt"],
};

const itemFields = z.object({
  title,
  type: z.enum(["activity", "sight", "food", "stay", "transit", "flight", "rail", "note"]),
  dayId: id.nullable(),
  placeId: id.nullable(),
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
const timesMessage = {
  message: "The end time needs a start time before it",
  path: ["endTime"],
};

export const schemas = {
  addItem: itemFields.partial().required({ title: true }).extend({ dayId: id.nullable() }).refine(checkTimes, timesMessage),
  updateItem: z.object({
    itemId: id,
    patch: itemFields.partial().refine(checkTimes, timesMessage),
  }),
  deleteItem: z.object({ itemId: id }),
  moveItem: z.object({ itemId: id, direction: z.enum(["earlier", "later"]) }),
  addDay: z.object({
    after: z.number().int().min(0).max(60).nullable().default(null),
  }),
  removeDay: z.object({ dayId: id }),
  moveDay: z.object({ dayId: id, to: z.number().int().min(1).max(60) }),
  updateDay: z.object({
    dayId: id,
    baseCity: z.string().trim().max(120).nullable(),
  }),
  updateTrip: z.object({
    name: z.string().trim().min(1, "Give it a name").max(120).optional(),
    destination: z.string().trim().max(200).nullable().optional(),
    startDate: z.iso.date().nullable().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    budgetTotal: amount.optional(),
  }),
  addPacking: z.object({
    items: z
      .array(packingFields.partial().required({ label: true }))
      .min(1)
      .max(30),
  }),
  updatePacking: z.object({
    packingId: id,
    patch: packingFields.extend({ packed: z.boolean() }).partial(),
  }),
  removePacking: z.object({ packingIds: z.array(id).min(1).max(50) }),
  addBooking: bookingFields.partial().required({ kind: true, title: true }).refine(checkDates, datesMessage),
  updateBooking: z.object({
    bookingId: id,
    patch: bookingFields.partial().refine(checkDates, datesMessage),
  }),
  deleteBooking: z.object({ bookingId: id }),
  addRuledOut: z.object({
    label: label(200),
    reason: z.string().trim().max(300).optional(),
  }),
  removeRuledOut: z.object({ ruledOutId: id }),
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
