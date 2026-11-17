import { dayDate, dayLabel, formatDay } from "@/lib/dates";
import { stamp } from "@/lib/itinerary/format";
import { budgetOf } from "@/lib/itinerary/budget";
import { checkDay } from "@/lib/itinerary/checks";
import { formatCost, groupDay, timeRange } from "@/lib/itinerary/group";
import { bookingKindLabel, slotLabel, typeLabel, type Booking, type Item, type Itinerary, type PackingItem } from "@/lib/itinerary/types";
import { readTripProfile, type TripProfile } from "@/lib/trip-profile";

export type RecentChange = {
  actor: "user" | "agent";
  summary: string;
  undone: boolean;
};

function itemLine(item: Item): string {
  const when = timeRange(item) ?? (item.slot ? slotLabel(item.slot).toLowerCase() : null);
  const facts = [typeLabel(item.type).toLowerCase(), when, item.status, formatCost(item.cost_amount, item.cost_currency), item.place?.name];
  const line = `- ${item.title} (${facts.filter(Boolean).join(", ")}) [item:${item.id}]`;
  return item.notes.trim() ? `${line}\n  notes: ${item.notes.trim().replace(/\s+/g, " ")}` : line;
}

/** Text people wrote, as one plain line: no line breaks to fake a new section, no angle brackets to close <trip>. */
const oneLine = (s: string) => s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

function packingLine(p: PackingItem): string {
  const facts = [p.category && oneLine(p.category), p.quantity > 1 ? `x${p.quantity}` : null, p.packed ? "packed" : null]
    .filter(Boolean)
    .join(", ");
  const why = p.reason.trim() ? ` because ${oneLine(p.reason)}` : "";
  return `- ${oneLine(p.label)}${facts ? ` (${facts})` : ""}${why} [pack:${p.id}]`;
}

/** Confirmation numbers and links stay out of the snapshot: the model has no use for them. */
function bookingLine(b: Booking): string {
  const when = [stamp(b.starts_at), b.ends_at ? `to ${stamp(b.ends_at)}` : null].filter(Boolean).join(" ");
  const facts = [
    bookingKindLabel(b.kind).toLowerCase(),
    b.status,
    when || null,
    formatCost(b.cost_amount, b.cost_currency),
    b.provider_name && oneLine(b.provider_name),
    b.confirmation_ref ? "has a confirmation number" : null,
  ];
  return `- ${oneLine(b.title)} (${facts.filter(Boolean).join(", ")}) [booking:${b.id}]`;
}

function profileLines(p: TripProfile): string[] {
  const out: string[] = [];
  if (p.travellers) {
    const kids = p.travellers.childAges;
    const adults = `${p.travellers.adults} ${p.travellers.adults === 1 ? "adult" : "adults"}`;
    out.push(`Travellers: ${adults}${kids.length ? `, children aged ${kids.join(", ")}` : ""}`);
  }
  if (p.pace) out.push(`Pace: ${p.pace}`);
  if (p.interests.length) out.push(`Interests: ${p.interests.join(", ")}`);
  if (p.dietary.length) out.push(`Dietary: ${p.dietary.join(", ")}`);
  if (p.accessibility) out.push(`Accessibility: ${p.accessibility}`);
  for (const pref of p.preferences) out.push(`Preference: ${pref}`);
  return out;
}

/**
 * The trip as the model sees it at the start of a turn: details, profile, each
 * day in display order, ideas, and the latest changes. Item ids are included so
 * the edit tools can name them.
 */
export function describeTrip(itinerary: Itinerary, recent: RecentChange[] = []): string {
  const { trip, days, ideas } = itinerary;
  const count = `${days.length} ${days.length === 1 ? "day" : "days"}`;
  const lines: string[] = [];

  lines.push(`Trip: ${trip.name}${trip.destination ? ` (${trip.destination})` : ""}`);
  if (trip.start_date) {
    const end = dayDate(trip.start_date, Math.max(days.length, 1))!;
    lines.push(`Dates: ${trip.start_date} to ${end}, ${count}`);
  } else {
    lines.push(`Dates: not set, ${count}`);
  }
  const budget = formatCost(trip.budget_total, trip.currency);
  lines.push(`Currency: ${trip.currency}. Budget: ${budget ?? "not set"}.`);

  const profile = profileLines(readTripProfile(trip.profile));
  lines.push("", "Profile", ...(profile.length ? profile : ["Nothing saved yet."]));

  for (const day of days) {
    const date = dayDate(trip.start_date, day.number);
    const title = [`Day ${day.number}`, date ? formatDay(date) : null, day.base_city].filter(Boolean).join(" · ");
    lines.push("", title);
    const sections = groupDay(day.items);
    if (sections.length === 0) lines.push("(nothing planned)");
    for (const section of sections) lines.push(...section.items.map(itemLine));
    for (const check of checkDay(day.items)) lines.push(`Check: ${check.message}`);
  }

  lines.push("", "Ideas (not on a day)");
  lines.push(...(ideas.length ? ideas.map(itemLine) : ["(none)"]));

  const b = budgetOf(itinerary);
  const onDays = Math.round(b.onDays.reduce((a, d) => a + d.amount, 0) * 100) / 100;
  const spend = [
    `Planned ${formatCost(b.planned, b.currency) ?? "0"}`,
    `on the days ${formatCost(onDays, b.currency) ?? "0"}`,
    `bookings ${formatCost(b.bookings, b.currency) ?? "0"}`,
  ];
  if (b.ideas) spend.push(`ideas not counted: ${formatCost(b.ideas, b.currency)}`);
  for (const o of b.other) spend.push(`also ${formatCost(o.amount, o.currency)} (not converted)`);
  lines.push("", "Spend", `${spend.join("; ")}.`);
  if (b.left != null)
    lines.push(
      b.left >= 0
        ? `Planned ${formatCost(b.planned, b.currency) ?? "0"} of ${budget}; ${formatCost(b.left, b.currency)} left.`
        : `Planned ${formatCost(b.planned, b.currency) ?? "0"}, ${formatCost(-b.left, b.currency)} over the ${budget} budget.`,
    );

  lines.push("", "Bookings");
  lines.push(...(itinerary.bookings.length ? itinerary.bookings.map(bookingLine) : ["(none)"]));

  lines.push("", "Packing list");
  lines.push(...(itinerary.packing.length ? itinerary.packing.map(packingLine) : ["(empty)"]));

  if (itinerary.ruledOut.length) {
    lines.push("", "Ruled out by the group. Don't suggest these again");
    for (const r of itinerary.ruledOut)
      lines.push(`- ${oneLine(r.label)}${r.reason.trim() ? ` (${oneLine(r.reason)})` : ""} [out:${r.id}]`);
  }

  if (recent.length) {
    lines.push("", "Latest changes, newest first");
    for (const c of recent) {
      lines.push(`- ${c.actor === "agent" ? "You" : "Traveller, by hand"}: ${c.summary}${c.undone ? " (undone by the traveller)" : ""}`);
    }
  }
  return lines.join("\n");
}

/** The text sent as the traveller's turn: the snapshot, the day on screen, then their words. */
export function turnContext(itinerary: Itinerary, recent: RecentChange[], scopeDayId: string | null): string {
  const day = itinerary.days.find((d) => d.id === scopeDayId);
  const scope = day ? `\n<looking_at>${dayLabel(itinerary.trip.start_date, day.number)}</looking_at>` : "";
  return `<trip>\n${describeTrip(itinerary, recent)}\n</trip>${scope}`;
}
