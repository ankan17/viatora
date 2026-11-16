import { SLOTS, type DaySlot, type Item } from "./types";

export type SectionKey = DaySlot | "anytime" | "stay";
export type Section = { key: SectionKey; label: string; items: Item[] };

/** "14:00:00" → "14:00" */
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Which part of the day a timed item falls in. */
export function slotForTime(time: string): DaySlot {
  const h = Number(time.slice(0, 2));
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

export function sectionOf(item: Pick<Item, "type" | "slot" | "start_time">): SectionKey {
  if (item.type === "stay") return "stay";
  if (item.start_time) return slotForTime(item.start_time);
  return item.slot ?? "anytime";
}

/** Timed items first in time order, then untimed ones by their manual position. */
export function compareItems(a: Item, b: Item): number {
  if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time) || a.position - b.position;
  if (a.start_time) return -1;
  if (b.start_time) return 1;
  return a.position - b.position;
}

const ORDER: { key: SectionKey; label: string }[] = [
  { key: "anytime", label: "Any time" },
  ...SLOTS.map((s) => ({ key: s.value as SectionKey, label: s.label })),
  { key: "stay", label: "Stay" },
];

/** A day's items as Morning / Afternoon / … sections, empty sections dropped. */
export function groupDay(items: Item[]): Section[] {
  return ORDER.map(({ key, label }) => ({
    key,
    label,
    items: items.filter((i) => sectionOf(i) === key).sort(compareItems),
  })).filter((s) => s.items.length > 0);
}

/** "09:30–11:00", "09:30", or null. */
export function timeRange(item: Pick<Item, "start_time" | "end_time">): string | null {
  const s = hhmm(item.start_time);
  const e = hhmm(item.end_time);
  return s ? (e ? `${s}–${e}` : s) : null;
}

export function formatCost(amount: number | null, currency: string | null): string | null {
  if (amount == null || !currency) return null;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
