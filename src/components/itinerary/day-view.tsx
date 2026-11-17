"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { More, Plus } from "@/components/ui/icons";
import { dayLabel } from "@/lib/dates";
import { checkDay } from "@/lib/itinerary/checks";
import { groupDay } from "@/lib/itinerary/group";
import type { Day, Item } from "@/lib/itinerary/types";
import { IdeaCard, ItemCard } from "./item-card";
import { useTrip } from "./trip-context";

export function dayTitle(day: Day, startDate: string | null) {
  return [dayLabel(startDate, day.number), day.base_city].filter(Boolean).join(" · ");
}

export function DayView({ day, showHeading = true }: { day: Day; showHeading?: boolean }) {
  const { itinerary, setEditor } = useTrip();
  const [settings, setSettings] = useState(false);
  const sections = groupDay(day.items);
  const checks = checkDay(day.items);

  return (
    <section aria-label={`Day ${day.number}`} className="flex flex-col gap-3">
      {showHeading && (
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-heading">{dayTitle(day, itinerary.trip.start_date)}</h3>
          {itinerary.canEdit && (
            <button type="button" onClick={() => setSettings(true)} aria-label={`Day ${day.number} settings`} className="-mr-2 flex size-11 items-center justify-center rounded-sm hover:bg-blush">
              <More />
            </button>
          )}
        </div>
      )}

      {checks.length > 0 && (
        <ul aria-label="Worth a look" className="flex flex-col gap-1 rounded-md bg-blush px-3 py-2 text-caption text-plum">
          {checks.map((c) => (
            <li key={c.itemIds.join()}>{c.message}</li>
          ))}
        </ul>
      )}

      {sections.length === 0 ? (
        <p className="rounded-md border border-dashed border-outline px-3 py-4 text-center text-caption text-muted">
          Nothing planned yet. {itinerary.canEdit ? "Add something, or ask in the chat." : ""}
        </p>
      ) : (
        sections.map((s) => (
          <div key={s.key} className="flex flex-col gap-1.5">
            <h4 className="text-label text-muted">{s.label}</h4>
            <ul className="flex flex-col gap-2">
              {s.items.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {itinerary.canEdit && (
        <Button variant="secondary" className="self-start" onClick={() => setEditor({ mode: "new", dayId: day.id })}>
          <Plus width={18} height={18} /> Add to Day {day.number}
        </Button>
      )}

      <DaySettings day={day} open={settings} onClose={() => setSettings(false)} />
    </section>
  );
}

function DaySettings({ day, open, onClose }: { day: Day; open: boolean; onClose: () => void }) {
  const { itinerary, run, pending } = useTrip();
  const count = itinerary.days.length;
  const act = async (p: Promise<boolean>) => (await p) && onClose();

  return (
    <Dialog open={open} onClose={onClose} title={`Day ${day.number}`}>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const city = String(new FormData(e.currentTarget).get("city") ?? "");
          act(run("updateDay", { dayId: day.id, baseCity: city || null }));
        }}
      >
        <Field id="city" name="city" label="Staying in" placeholder="Kyoto" defaultValue={day.base_city ?? ""} maxLength={120} className="flex-1" />
        <Button type="submit" variant="secondary" disabled={pending}>
          Save
        </Button>
      </form>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={pending || day.number === 1} onClick={() => act(run("moveDay", { dayId: day.id, to: day.number - 1 }))}>
          Move earlier
        </Button>
        <Button variant="secondary" disabled={pending || day.number === count} onClick={() => act(run("moveDay", { dayId: day.id, to: day.number + 1 }))}>
          Move later
        </Button>
        <Button variant="secondary" disabled={pending || count >= 60} onClick={() => act(run("addDay", { after: day.number }))}>
          Add a day after
        </Button>
        <Button variant="ghost" disabled={pending || count <= 1} onClick={() => act(run("removeDay", { dayId: day.id }))}>
          Remove day
        </Button>
      </div>
      {day.items.length > 0 && <p className="text-caption text-muted">Removing a day moves its plans to ideas. You can undo it.</p>}
    </Dialog>
  );
}

export function IdeasList() {
  const { itinerary, run, pending, setEditor } = useTrip();
  const [placing, setPlacing] = useState<Item | null>(null);

  return (
    <section aria-label="Ideas" className="flex flex-col gap-2">
      <h3 className="text-label text-muted">Ideas not on a day yet</h3>
      {itinerary.ideas.length === 0 ? (
        <p className="text-caption text-muted">Places you might go. Keep them here until they fit a day.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {itinerary.ideas.map((i) => (
            <li key={i.id}>
              <IdeaCard item={i} onPlace={setPlacing} />
            </li>
          ))}
        </ul>
      )}
      {itinerary.canEdit && (
        <Button variant="ghost" className="self-start" onClick={() => setEditor({ mode: "new", dayId: null })}>
          <Plus width={18} height={18} /> Add an idea
        </Button>
      )}

      <Dialog open={placing !== null} onClose={() => setPlacing(null)} title="Add to a day">
        {placing && (
          <>
            <p className="text-body text-muted">Which day should {placing.title} go on?</p>
            <div className="grid grid-cols-3 gap-2">
              {itinerary.days.map((d) => (
                <Button
                  key={d.id}
                  variant="secondary"
                  disabled={pending}
                  onClick={async () => (await run("updateItem", { itemId: placing.id, patch: { dayId: d.id } })) && setPlacing(null)}
                >
                  Day {d.number}
                </Button>
              ))}
            </div>
          </>
        )}
      </Dialog>
    </section>
  );
}
