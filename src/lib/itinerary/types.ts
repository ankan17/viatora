import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type ItemType = Database["public"]["Enums"]["item_type"];
export type ItemStatus = Database["public"]["Enums"]["item_status"];
export type DaySlot = Database["public"]["Enums"]["day_slot"];

export type Item = Pick<
  Tables["items"]["Row"],
  | "id"
  | "day_id"
  | "type"
  | "title"
  | "start_time"
  | "end_time"
  | "slot"
  | "position"
  | "status"
  | "cost_amount"
  | "cost_currency"
  | "notes"
  | "url"
> & { place: { name: string | null } | null };

export type Day = Pick<Tables["days"]["Row"], "id" | "number" | "base_city" | "notes"> & { items: Item[] };

export type Trip = Pick<Tables["trips"]["Row"], "id" | "name" | "destination" | "start_date" | "currency" | "budget_total" | "profile">;

export type PackingItem = Pick<Tables["packing_items"]["Row"], "id" | "label" | "reason" | "category" | "quantity" | "packed" | "position">;
export type Booking = Pick<
  Tables["bookings"]["Row"],
  | "id"
  | "kind"
  | "title"
  | "provider_name"
  | "confirmation_ref"
  | "starts_at"
  | "ends_at"
  | "cost_amount"
  | "cost_currency"
  | "status"
  | "url"
  | "notes"
>;
export type RuledOut = Pick<Tables["ruled_out"]["Row"], "id" | "label" | "reason">;
export type BookingKind = Database["public"]["Enums"]["booking_kind"];
export type BookingStatus = Database["public"]["Enums"]["booking_status"];

/** Everything the trip screens need, in one read. */
export type Itinerary = {
  trip: Trip;
  days: Day[];
  ideas: Item[];
  packing: PackingItem[];
  bookings: Booking[];
  ruledOut: RuledOut[];
  canEdit: boolean;
};

export const BOOKING_KINDS: { value: BookingKind; label: string }[] = [
  { value: "stay", label: "Stay" },
  { value: "flight", label: "Flight" },
  { value: "rail", label: "Train" },
  { value: "activity", label: "Activity" },
  { value: "car", label: "Car" },
  { value: "other", label: "Other" },
];
export const BOOKING_STATUSES: { value: BookingStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];
export const bookingKindLabel = (k: BookingKind) => BOOKING_KINDS.find((x) => x.value === k)?.label ?? k;

export const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "activity", label: "Activity" },
  { value: "sight", label: "Sight" },
  { value: "food", label: "Food" },
  { value: "stay", label: "Stay" },
  { value: "transit", label: "Getting around" },
  { value: "flight", label: "Flight" },
  { value: "rail", label: "Train" },
  { value: "note", label: "Note" },
];

export const SLOTS: { value: DaySlot; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
];

export const STATUSES: { value: ItemStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "planned", label: "Planned" },
  { value: "booked", label: "Booked" },
];

export const typeLabel = (t: ItemType) => ITEM_TYPES.find((x) => x.value === t)?.label ?? t;
export const slotLabel = (s: DaySlot) => SLOTS.find((x) => x.value === s)?.label ?? s;
