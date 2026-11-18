"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { createTrip, type NewTripState } from "../actions";

export function NewTripForm() {
  const [state, action, pending] = useActionState<NewTripState, FormData>(createTrip, {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        id="name"
        name="name"
        label="Trip name"
        placeholder="Summer in Portugal"
        required
        maxLength={120}
        defaultValue={f.name}
        autoFocus
      />
      <Field
        id="destination"
        name="destination"
        label="Where to"
        placeholder="Lisbon and the Algarve"
        maxLength={200}
        defaultValue={f.destination}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field id="startDate" name="startDate" type="date" label="First day" hint="Optional" defaultValue={f.startDate} />
        <Field id="days" name="days" type="number" label="Days" min={1} max={60} required defaultValue={f.days ?? "3"} />
      </div>
      {state.error && (
        <p role="alert" className="text-caption font-bold text-plum">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Start planning"}
      </Button>
    </form>
  );
}
