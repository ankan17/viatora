"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, TextArea } from "@/components/ui/field";
import { ArrowDown, ArrowUp } from "@/components/ui/icons";
import { hhmm } from "@/lib/itinerary/group";
import type { OpInput } from "@/lib/itinerary/ops";
import { ITEM_TYPES, SLOTS, STATUSES, type DaySlot, type Item, type ItemStatus, type ItemType } from "@/lib/itinerary/types";
import { useTrip } from "./trip-context";

type When = "any" | DaySlot | "time";
type Form = {
  title: string;
  type: ItemType;
  dayId: string;
  when: When;
  startTime: string;
  endTime: string;
  status: ItemStatus;
  cost: string;
  currency: string;
  notes: string;
};

const WHEN_OPTIONS: { value: When; label: string }[] = [{ value: "any", label: "Any time" }, ...SLOTS, { value: "time", label: "At a time" }];
const IDEAS = "ideas";

function fromItem(item: Item | null, dayId: string | null, currency: string): Form {
  return {
    title: item?.title ?? "",
    type: item?.type ?? "activity",
    dayId: (item ? item.day_id : dayId) ?? IDEAS,
    when: item?.start_time ? "time" : (item?.slot ?? "any"),
    startTime: hhmm(item?.start_time ?? null) ?? "",
    endTime: hhmm(item?.end_time ?? null) ?? "",
    status: item?.status ?? (dayId ? "planned" : "idea"),
    cost: item?.cost_amount != null ? String(item.cost_amount) : "",
    currency: item?.cost_currency ?? currency,
    notes: item?.notes ?? "",
  };
}

type Fields = OpInput<"addItem">;

function toFields(f: Form): Fields {
  const amount = f.cost.trim() === "" ? null : Number(f.cost);
  return {
    title: f.title,
    type: f.type,
    dayId: f.dayId === IDEAS ? null : f.dayId,
    slot: f.when === "any" || f.when === "time" ? null : f.when,
    startTime: f.when === "time" ? f.startTime || null : null,
    endTime: f.when === "time" ? f.endTime || null : null,
    status: f.status,
    costAmount: amount,
    costCurrency: amount == null ? null : f.currency.toUpperCase(),
    notes: f.notes,
  };
}

/** Only the fields the person changed, so the summary says what actually happened. */
function diff(before: Fields, after: Fields): Partial<Fields> {
  const out: Partial<Fields> = {};
  for (const k of Object.keys(after) as (keyof Fields)[]) {
    if (after[k] !== before[k]) (out as Record<string, unknown>)[k] = after[k];
  }
  // Time fields travel together so the server can keep slot and time consistent.
  if ("slot" in out || "startTime" in out || "endTime" in out) {
    out.slot = after.slot;
    out.startTime = after.startTime;
    out.endTime = after.endTime;
  }
  if ("costAmount" in out || "costCurrency" in out) {
    out.costAmount = after.costAmount;
    out.costCurrency = after.costCurrency;
  }
  return out;
}

export function ItemEditor() {
  const { editor, setEditor } = useTrip();
  const close = () => setEditor(null);
  const title = editor?.mode === "edit" ? "Edit plan" : editor?.dayId ? "Add to the day" : "Add an idea";
  return (
    <Dialog open={editor !== null} onClose={close} title={title}>
      {editor && <EditorForm key={editor.mode === "edit" ? editor.item.id : `new-${editor.dayId}`} onDone={close} />}
    </Dialog>
  );
}

function EditorForm({ onDone }: { onDone: () => void }) {
  const { editor, itinerary, run, pending } = useTrip();
  const item = editor?.mode === "edit" ? editor.item : null;
  const initial = fromItem(item, editor?.mode === "new" ? editor.dayId : null, itinerary.trip.currency);
  const [f, setF] = useState<Form>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((cur) => ({ ...cur, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fields = toFields(f);
    if (fields.costAmount != null && Number.isNaN(fields.costAmount)) return setError("Enter the cost as a number.");
    if (f.when === "time" && !f.startTime) return setError("Pick a start time, or choose a part of the day.");

    if (!item) {
      if (await run("addItem", fields)) onDone();
      return;
    }
    const patch = diff(toFields(initial), fields);
    if (Object.keys(patch).length === 0) return onDone();
    if (await run("updateItem", { itemId: item.id, patch })) onDone();
  }

  const canReorder = item && item.day_id && !item.start_time;

  return (
    <form onSubmit={submit} className="flex max-h-[calc(90dvh-80px)] flex-col gap-4 overflow-y-auto pb-1">
      <Field id="item-title" label="What" value={f.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} placeholder="Fushimi Inari Shrine" autoFocus={!item} />
      <div className="grid grid-cols-2 gap-3">
        <Select id="item-type" label="Kind" value={f.type} onChange={(e) => set("type", e.target.value as ItemType)}>
          {ITEM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select id="item-day" label="Day" value={f.dayId} onChange={(e) => set("dayId", e.target.value)}>
          <option value={IDEAS}>Ideas (no day)</option>
          {itinerary.days.map((d) => (
            <option key={d.id} value={d.id}>
              Day {d.number}
            </option>
          ))}
        </Select>
      </div>

      <ChoiceChips name="when" label="When" options={WHEN_OPTIONS} value={f.when} onChange={(v) => set("when", v)} />
      {f.when === "time" && (
        <div className="grid grid-cols-2 gap-3">
          <Field id="item-start" label="Starts" type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} required />
          <Field id="item-end" label="Ends" hint="Optional" type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />
        </div>
      )}

      <ChoiceChips name="status" label="Status" options={STATUSES} value={f.status} onChange={(v) => set("status", v)} />

      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field id="item-cost" label="Cost" hint="Optional" inputMode="decimal" value={f.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" />
        <Field id="item-currency" label="Currency" value={f.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
      </div>

      <TextArea id="item-notes" label="Notes" value={f.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} placeholder="Book ahead, bring cash…" />

      {error && (
        <p role="alert" className="text-caption font-bold text-plum">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 flex flex-col gap-2 bg-ground pt-1">
        <Button type="submit" disabled={pending}>
          {item ? "Save" : "Add"}
        </Button>
        {item && (
          <div className="flex flex-wrap gap-2">
            {canReorder && (
              <>
                <Button type="button" variant="secondary" disabled={pending} onClick={() => run("moveItem", { itemId: item.id, direction: "earlier" }).then((ok) => ok && onDone())}>
                  <ArrowUp width={18} height={18} /> Earlier
                </Button>
                <Button type="button" variant="secondary" disabled={pending} onClick={() => run("moveItem", { itemId: item.id, direction: "later" }).then((ok) => ok && onDone())}>
                  <ArrowDown width={18} height={18} /> Later
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" className="ml-auto" disabled={pending} onClick={() => run("deleteItem", { itemId: item.id }).then((ok) => ok && onDone())}>
              Remove
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
