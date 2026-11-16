import { dayDate, dayLabel, formatDay } from "@/lib/dates";
import { formatCost, groupDay, timeRange } from "@/lib/itinerary/group";
import { slotLabel, typeLabel, type Item, type Itinerary } from "@/lib/itinerary/types";
import { readTripProfile, type TripProfile } from "@/lib/trip-profile";

export type RecentChange = { actor: "user" | "agent"; summary: string; undone: boolean };

function itemLine(item: Item): string {
  const when = timeRange(item) ?? (item.slot ? slotLabel(item.slot).toLowerCase() : null);
  const facts = [typeLabel(item.type).toLowerCase(), when, item.status, formatCost(item.cost_amount, item.cost_currency), item.place?.name];
  const line = `- ${item.title} (${facts.filter(Boolean).join(", ")}) [item:${item.id}]`;
  return item.notes.trim() ? `${line}\n  notes: ${item.notes.trim().replace(/\s+/g, " ")}` : line;
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
  }

  lines.push("", "Ideas (not on a day)");
  lines.push(...(ideas.length ? ideas.map(itemLine) : ["(none)"]));

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
