import type { Itinerary } from "./types";

export type Budget = {
  currency: string;
  /** The group's budget, if one is set. */
  total: number | null;
  /** On the days plus live bookings, in the trip's currency. */
  planned: number;
  onDays: { day: number; amount: number }[];
  bookings: number;
  /** Ideas with a cost, not counted in `planned`. */
  ideas: number;
  /** Costs in another currency. They are listed, never converted or added in. */
  other: { currency: string; amount: number }[];
  /** `total - planned`, or null with no budget. Negative when over. */
  left: number | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * What the trip costs as planned. Items on a day and bookings that aren't
 * cancelled count; ideas are shown apart. A booking and the plan item for it
 * both count if both carry a cost, so a cost belongs on one of them.
 */
export function budgetOf({ trip, days, ideas, bookings }: Pick<Itinerary, "trip" | "days" | "ideas" | "bookings">): Budget {
  const other = new Map<string, number>();
  const sum = (rows: { cost_amount: number | null; cost_currency: string | null }[], foreign: Map<string, number> | null = other) => {
    let mine = 0;
    for (const r of rows) {
      if (r.cost_amount == null || !r.cost_currency) continue;
      if (r.cost_currency === trip.currency) mine += r.cost_amount;
      else foreign?.set(r.cost_currency, (foreign.get(r.cost_currency) ?? 0) + r.cost_amount);
    }
    return mine;
  };

  const onDays = days.map((d) => ({
    day: d.number,
    amount: round(sum(d.items)),
  }));
  const live = bookings.filter((b) => b.status !== "cancelled");
  const bookingsTotal = round(sum(live));
  // Ideas are priced apart and don't add to the foreign totals.
  const ideasTotal = round(sum(ideas, null));

  const planned = round(onDays.reduce((a, d) => a + d.amount, 0) + bookingsTotal);
  return {
    currency: trip.currency,
    total: trip.budget_total,
    planned,
    onDays,
    bookings: bookingsTotal,
    ideas: ideasTotal,
    other: [...other]
      .map(([currency, amount]) => ({ currency, amount: round(amount) }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    left: trip.budget_total == null ? null : round(trip.budget_total - planned),
  };
}
