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

/** Everything the itinerary screens need, in one read. */
export type Itinerary = { trip: Trip; days: Day[]; ideas: Item[]; canEdit: boolean };

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
