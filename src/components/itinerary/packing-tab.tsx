"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, TextArea } from "@/components/ui/field";
import { Plus } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { PackingItem } from "@/lib/itinerary/types";
import { useTrip } from "./trip-context";

const OTHER = "Other";

function groups(items: PackingItem[]) {
  const by = new Map<string, PackingItem[]>();
  for (const i of items) by.set(i.category?.trim() || OTHER, [...(by.get(i.category?.trim() || OTHER) ?? []), i]);
  return [...by].sort(([a], [b]) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b)));
}

export function PackingTab() {
  const { itinerary, run, pending, recentId } = useTrip();
  const [editing, setEditing] = useState<PackingItem | null>(null);
  const [draft, setDraft] = useState("");
  const { packing, canEdit } = itinerary;
  const packed = packing.filter((p) => p.packed).length;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    if (await run("addPacking", { items: [{ label: draft }] })) setDraft("");
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      {packing.length === 0 ? (
        <p className="text-body text-muted">
          Nothing to pack yet. Ask in the chat for a list that fits the plan and the weather, or add things yourself.
        </p>
      ) : (
        <p className="text-caption text-muted" aria-live="polite">
          {packed} of {packing.length} packed
        </p>
      )}

      {groups(packing).map(([category, items]) => (
        <section key={category} aria-label={category} className="flex flex-col gap-1">
          <h3 className="text-label text-muted">{category}</h3>
          <ul className="flex flex-col">
            {items.map((p) => (
              <li key={p.id} className={cn("flex items-start gap-1 border-b border-hairline py-1", recentId === p.id && "bg-blush")}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={p.packed}
                  aria-label={`Packed: ${p.label}`}
                  disabled={!canEdit || pending}
                  onClick={() => run("updatePacking", { packingId: p.id, patch: { packed: !p.packed } }, { quiet: true })}
                  className="flex size-11 shrink-0 items-center justify-center"
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-sm border-2",
                      p.packed ? "border-plum bg-plum text-on-plum" : "border-outline bg-raised",
                    )}
                  >
                    {p.packed && (
                      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditing(p)}
                  aria-label={`${p.label}${p.quantity > 1 ? `, ${p.quantity}` : ""}. Edit`}
                  className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-1 text-left"
                >
                  <span className={cn("font-bold", p.packed && "text-muted line-through")}>
                    {p.label}
                    {p.quantity > 1 && <span className="font-normal text-muted"> × {p.quantity}</span>}
                  </span>
                  {p.reason && <span className="text-caption text-muted">{p.reason}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {canEdit && (
        <form onSubmit={add} className="flex items-end gap-2">
          <Field
            id="packing-add"
            label="Add something"
            className="flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={120}
            placeholder="Rain jacket"
          />
          <Button type="submit" variant="secondary" disabled={pending || !draft.trim()} aria-label="Add to the packing list">
            <Plus width={18} height={18} /> Add
          </Button>
        </form>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit packing item">
        {editing && <PackingForm key={editing.id} item={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function PackingForm({ item, onDone }: { item: PackingItem; onDone: () => void }) {
  const { run, pending } = useTrip();
  const [f, setF] = useState({ label: item.label, reason: item.reason, category: item.category ?? "", quantity: String(item.quantity) });
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(f.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return setError("Quantity is a whole number from 1 to 99.");
    const patch = {
      ...(f.label !== item.label && { label: f.label }),
      ...(f.reason !== item.reason && { reason: f.reason }),
      ...(f.category.trim() !== (item.category ?? "") && { category: f.category.trim() || null }),
      ...(quantity !== item.quantity && { quantity }),
    };
    if (Object.keys(patch).length === 0) return onDone();
    if (await run("updatePacking", { packingId: item.id, patch })) onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field
        id="pack-label"
        label="What"
        value={f.label}
        onChange={(e) => setF({ ...f, label: e.target.value })}
        required
        maxLength={120}
      />
      <TextArea
        id="pack-reason"
        label="Why"
        value={f.reason}
        maxLength={300}
        onChange={(e) => setF({ ...f, reason: e.target.value })}
        placeholder="Rain forecast on day 3"
      />
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field
          id="pack-category"
          label="Group"
          hint="Optional"
          value={f.category}
          maxLength={60}
          onChange={(e) => setF({ ...f, category: e.target.value })}
          placeholder="Clothes"
        />
        <Field
          id="pack-qty"
          label="How many"
          inputMode="numeric"
          value={f.quantity}
          onChange={(e) => setF({ ...f, quantity: e.target.value })}
        />
      </div>
      {error && (
        <p role="alert" className="text-caption font-bold text-plum">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => run("removePacking", { packingIds: [item.id] }).then((ok) => ok && onDone())}
        >
          Remove
        </Button>
      </div>
    </form>
  );
}
