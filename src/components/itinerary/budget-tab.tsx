"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { budgetOf } from "@/lib/itinerary/budget";
import { formatCost } from "@/lib/itinerary/group";
import { useTrip } from "./trip-context";

export function BudgetTab() {
  const { itinerary, run, pending } = useTrip();
  const b = budgetOf(itinerary);
  const money = (n: number, c = b.currency) => formatCost(n, c) ?? "0";
  const [draft, setDraft] = useState(b.total == null ? "" : String(b.total));
  const [error, setError] = useState<string | null>(null);
  const priced = b.onDays.filter((d) => d.amount > 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    const amount = draft.trim() === "" ? null : Number(draft);
    if (amount != null && (Number.isNaN(amount) || amount < 0)) return setError("Enter the budget as a number.");
    setError(null);
    await run("updateTrip", { budgetTotal: amount });
  }

  const over = b.left != null && b.left < 0;
  return (
    <div className="flex flex-col gap-5 p-4">
      <section aria-label="Totals" className="flex flex-col gap-2 rounded-md border border-hairline bg-raised p-3">
        <Row label="Planned" value={money(b.planned)} strong />
        <Row label="Budget" value={b.total == null ? "Not set" : money(b.total)} />
        {b.left != null && (
          <Row label={over ? "Over budget by" : "Left"} value={money(Math.abs(b.left))} tone={over ? "over" : undefined} />
        )}
      </section>

      {itinerary.canEdit && (
        <form onSubmit={save} className="flex items-end gap-2">
          <Field
            id="budget-total"
            label={`Budget in ${b.currency}`}
            className="flex-1"
            inputMode="decimal"
            value={draft}
            error={error ?? undefined}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="3000"
          />
          <Button type="submit" variant="secondary" disabled={pending}>
            Save
          </Button>
        </form>
      )}

      <section aria-label="Where it goes" className="flex flex-col gap-1">
        <h3 className="text-label text-muted">Where it goes</h3>
        {priced.length === 0 && b.bookings === 0 ? (
          <p className="text-caption text-muted">Costs you add to plans and bookings show up here. Ideas are not counted.</p>
        ) : (
          <ul className="flex flex-col">
            {priced.map((d) => (
              <li key={d.day} className="border-b border-hairline">
                <Row label={`Day ${d.day}`} value={money(d.amount)} />
              </li>
            ))}
            {b.bookings > 0 && (
              <li className="border-b border-hairline">
                <Row label="Bookings" value={money(b.bookings)} />
              </li>
            )}
          </ul>
        )}
        {b.ideas > 0 && (
          <p className="text-caption text-muted">Ideas not on a day would add {money(b.ideas)}. They are not counted above.</p>
        )}
        {b.other.map((o) => (
          <p key={o.currency} className="text-caption text-muted">
            Also {money(o.amount, o.currency)}, in another currency. It isn&apos;t converted or counted above.
          </p>
        ))}
        <p className="text-caption text-muted">
          A booking and the plan for it both count if both have a cost, so put the cost on one of them.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "over" }) {
  return (
    <div className="flex min-h-9 items-baseline justify-between gap-3">
      <span className={strong ? "font-bold" : "text-muted"}>{label}</span>
      <span className={`${strong ? "text-heading" : "font-bold"} ${tone === "over" ? "text-plum" : ""}`}>{value}</span>
    </div>
  );
}
