"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { useTrip } from "./trip-context";

export function TripDetailsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Trip details">
      {open && <TripDetailsForm onDone={onClose} />}
    </Dialog>
  );
}

function TripDetailsForm({ onDone }: { onDone: () => void }) {
  const { itinerary, run, pending } = useTrip();
  const t = itinerary.trip;
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (k: string) => String(form.get(k) ?? "").trim();
    const budget = get("budget");
    if (budget && Number.isNaN(Number(budget))) return setError("Enter the budget as a number.");
    const next = {
      name: get("name"),
      destination: get("destination") || null,
      startDate: get("startDate") || null,
      currency: get("currency").toUpperCase(),
      budgetTotal: budget ? Number(budget) : null,
    };
    const patch = Object.fromEntries(
      Object.entries(next).filter(([k, v]) => {
        const before = { name: t.name, destination: t.destination, startDate: t.start_date, currency: t.currency, budgetTotal: t.budget_total }[k];
        return v !== before;
      }),
    );
    if (Object.keys(patch).length === 0) return onDone();
    if (await run("updateTrip", patch)) onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field id="trip-name" name="name" label="Trip name" defaultValue={t.name} required maxLength={120} />
      <Field id="trip-destination" name="destination" label="Where to" defaultValue={t.destination ?? ""} maxLength={200} />
      <Field id="trip-start" name="startDate" type="date" label="First day" hint="Dates unlock weather and opening hours." defaultValue={t.start_date ?? ""} />
      <div className="grid grid-cols-[96px_1fr] gap-3">
        <Field id="trip-currency" name="currency" label="Currency" defaultValue={t.currency} maxLength={3} pattern="[A-Za-z]{3}" required />
        <Field id="trip-budget" name="budget" label="Budget" hint="Optional, for the whole group" inputMode="decimal" defaultValue={t.budget_total ?? ""} />
      </div>
      {error && (
        <p role="alert" className="text-caption font-bold text-plum">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Save
      </Button>
    </form>
  );
}
