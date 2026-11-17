"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, TextArea } from "@/components/ui/field";
import { Plus } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { stamp, toInput } from "@/lib/itinerary/format";
import { formatCost } from "@/lib/itinerary/group";
import type { OpInput } from "@/lib/itinerary/ops";
import {
  BOOKING_KINDS,
  BOOKING_STATUSES,
  bookingKindLabel,
  type Booking,
  type BookingKind,
  type BookingStatus,
} from "@/lib/itinerary/types";
import { useTrip } from "./trip-context";

const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export function BookingsTab() {
  const { itinerary, recentId } = useTrip();
  const [editing, setEditing] = useState<Booking | "new" | null>(null);
  const { bookings, canEdit } = itinerary;

  return (
    <div className="flex flex-col gap-4 p-4">
      {bookings.length === 0 ? (
        <p className="text-body text-muted">
          Nothing here yet. Keep flights, stays and tours with their confirmation numbers and links. Tell the chat about a booking, or add
          it yourself.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bookings.map((b) => (
            <li key={b.id}>
              <BookingCard booking={b} recent={recentId === b.id} onEdit={canEdit ? () => setEditing(b) : undefined} />
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Button variant="secondary" className="self-start" onClick={() => setEditing("new")}>
          <Plus width={18} height={18} /> Add a booking
        </Button>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a booking" : "Edit booking"}>
        {editing && (
          <BookingForm
            key={editing === "new" ? "new" : editing.id}
            booking={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

const statusStyle: Record<BookingStatus, string> = {
  pending: "border border-dashed border-outline bg-raised text-muted",
  confirmed: "bg-ink text-ground",
  cancelled: "bg-blush text-plum line-through",
};

function BookingCard({ booking: b, recent, onEdit }: { booking: Booking; recent: boolean; onEdit?: () => void }) {
  const when = [stamp(b.starts_at), b.ends_at ? `to ${stamp(b.ends_at)}` : null].filter(Boolean).join(" ");
  const details = [bookingKindLabel(b.kind), b.provider_name, when, formatCost(b.cost_amount, b.cost_currency)].filter(Boolean).join(" · ");
  const link = safeUrl(b.url);
  const label = BOOKING_STATUSES.find((s) => s.value === b.status)!.label;
  return (
    <div
      className={cn("flex flex-col gap-2 rounded-md bg-raised p-3", recent ? "border-2 border-plum p-[11px]" : "border border-hairline")}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-bold">{b.title}</span>
          <span className="text-caption text-muted">{details}</span>
        </div>
        <span className={cn("inline-flex h-6 shrink-0 items-center rounded-lg px-2 text-label", statusStyle[b.status])}>{label}</span>
      </div>
      {b.confirmation_ref && (
        <p className="text-caption">
          <span className="text-muted">Confirmation </span>
          <span className="font-mono font-bold">{b.confirmation_ref}</span>
        </p>
      )}
      {b.notes && <p className="text-caption text-muted">{b.notes}</p>}
      {(link || onEdit) && (
        <div className="-mb-1 flex flex-wrap gap-1">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open the page for ${b.title}`}
              className="inline-flex min-h-11 items-center rounded-sm px-3 font-bold text-plum hover:bg-blush"
            >
              Open booking page
            </a>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${b.title}`}
              className="inline-flex min-h-11 items-center rounded-sm px-3 font-bold text-plum hover:bg-blush"
            >
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type Fields = OpInput<"addBooking">;

function BookingForm({ booking, onDone }: { booking: Booking | null; onDone: () => void }) {
  const { itinerary, run, pending } = useTrip();
  const [f, setF] = useState({
    kind: (booking?.kind ?? "other") as BookingKind,
    title: booking?.title ?? "",
    provider: booking?.provider_name ?? "",
    ref: booking?.confirmation_ref ?? "",
    starts: toInput(booking?.starts_at ?? null),
    ends: toInput(booking?.ends_at ?? null),
    status: (booking?.status ?? "pending") as BookingStatus,
    cost: booking?.cost_amount != null ? String(booking.cost_amount) : "",
    currency: booking?.cost_currency ?? itinerary.trip.currency,
    url: booking?.url ?? "",
    notes: booking?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));

  function fields(): Fields | string {
    const amount = f.cost.trim() === "" ? null : Number(f.cost);
    if (amount != null && Number.isNaN(amount)) return "Enter the cost as a number.";
    return {
      kind: f.kind,
      title: f.title,
      providerName: f.provider.trim() || null,
      confirmationRef: f.ref.trim() || null,
      startsAt: f.starts || null,
      endsAt: f.ends || null,
      status: f.status,
      costAmount: amount,
      costCurrency: amount == null ? null : f.currency.toUpperCase(),
      url: f.url.trim() || null,
      notes: f.notes,
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const next = fields();
    if (typeof next === "string") return setError(next);
    if (!booking) {
      if (await run("addBooking", next)) onDone();
      return;
    }
    const before = {
      kind: booking.kind,
      title: booking.title,
      providerName: booking.provider_name,
      confirmationRef: booking.confirmation_ref,
      startsAt: toInput(booking.starts_at) || null,
      endsAt: toInput(booking.ends_at) || null,
      status: booking.status,
      costAmount: booking.cost_amount,
      costCurrency: booking.cost_currency,
      url: booking.url,
      notes: booking.notes,
    } satisfies Fields;
    const patch: Partial<Fields> = {};
    for (const k of Object.keys(next) as (keyof Fields)[]) if (next[k] !== before[k]) (patch as Record<string, unknown>)[k] = next[k];
    if ("costAmount" in patch || "costCurrency" in patch) {
      patch.costAmount = next.costAmount;
      patch.costCurrency = next.costCurrency;
    }
    if (Object.keys(patch).length === 0) return onDone();
    if (await run("updateBooking", { bookingId: booking.id, patch })) onDone();
  }

  return (
    <form onSubmit={submit} className="flex max-h-[calc(90dvh-80px)] flex-col gap-4 overflow-y-auto pb-1">
      <Field
        id="booking-title"
        label="What"
        value={f.title}
        onChange={(e) => set("title", e.target.value)}
        required
        maxLength={200}
        placeholder="Flight LHR to KIX"
        autoFocus={!booking}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select id="booking-kind" label="Kind" value={f.kind} onChange={(e) => set("kind", e.target.value as BookingKind)}>
          {BOOKING_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        <Field
          id="booking-provider"
          label="Company"
          hint="Optional"
          value={f.provider}
          maxLength={120}
          onChange={(e) => set("provider", e.target.value)}
        />
      </div>
      <ChoiceChips name="booking-status" label="Status" options={BOOKING_STATUSES} value={f.status} onChange={(v) => set("status", v)} />
      <Field
        id="booking-ref"
        label="Confirmation number"
        hint="Optional"
        value={f.ref}
        maxLength={120}
        onChange={(e) => set("ref", e.target.value)}
        autoComplete="off"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="booking-starts"
          label="Starts"
          hint="Local time"
          type="datetime-local"
          value={f.starts}
          onChange={(e) => set("starts", e.target.value)}
        />
        <Field
          id="booking-ends"
          label="Ends"
          hint="Optional"
          type="datetime-local"
          value={f.ends}
          onChange={(e) => set("ends", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field
          id="booking-cost"
          label="Cost"
          hint="Optional"
          inputMode="decimal"
          value={f.cost}
          onChange={(e) => set("cost", e.target.value)}
          placeholder="0"
        />
        <Field
          id="booking-currency"
          label="Currency"
          value={f.currency}
          maxLength={3}
          onChange={(e) => set("currency", e.target.value.toUpperCase())}
        />
      </div>
      <Field
        id="booking-url"
        label="Link"
        hint="Optional. Starts with https://"
        type="url"
        value={f.url}
        maxLength={2000}
        onChange={(e) => set("url", e.target.value)}
      />
      <TextArea
        id="booking-notes"
        label="Notes"
        value={f.notes}
        maxLength={2000}
        onChange={(e) => set("notes", e.target.value)}
        placeholder="Check-in from 15:00"
      />
      {error && (
        <p role="alert" className="text-caption font-bold text-plum">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 flex flex-col gap-2 bg-ground pt-1">
        <Button type="submit" disabled={pending}>
          {booking ? "Save" : "Add"}
        </Button>
        {booking && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => run("deleteBooking", { bookingId: booking.id }).then((ok) => ok && onDone())}
          >
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}
