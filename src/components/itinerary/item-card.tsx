"use client";

import { StatusChip } from "@/components/ui/status-chip";
import { Plus } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatCost, timeRange } from "@/lib/itinerary/group";
import { typeLabel, type Item } from "@/lib/itinerary/types";
import { useTrip } from "./trip-context";

export function ItemCard({ item }: { item: Item }) {
  const { itinerary, setEditor, recentId } = useTrip();
  const details = [typeLabel(item.type), timeRange(item), item.place?.name, formatCost(item.cost_amount, item.cost_currency)]
    .filter(Boolean)
    .join(" · ");
  const recent = recentId === item.id;

  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-bold">{item.title}</span>
        <span className={cn("truncate text-caption", recent ? "font-bold text-plum" : "text-muted")}>
          {details}
          {recent && " · just now"}
        </span>
      </span>
      <StatusChip status={item.status} />
    </>
  );

  const cls = cn(
    "flex min-h-11 w-full items-center gap-3 rounded-md bg-raised px-3 py-2.5 text-left",
    recent ? "border-2 border-plum px-[11px] py-[9px]" : "border border-hairline",
  );

  if (!itinerary.canEdit) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={cn(cls, "hover:border-outline")} onClick={() => setEditor({ mode: "edit", item })} aria-label={`${item.title}, ${details}, ${item.status}. Edit`}>
      {body}
    </button>
  );
}

/** An idea in the backlog: dashed, with a button to put it on a day. */
export function IdeaCard({ item, onPlace }: { item: Item; onPlace: (item: Item) => void }) {
  const { itinerary, setEditor, recentId } = useTrip();
  return (
    <div className={cn("flex min-h-12 items-center gap-2 rounded-md border border-dashed border-outline bg-raised pl-3 pr-1", recentId === item.id && "border-2 border-solid border-plum")}>
      {itinerary.canEdit ? (
        <button type="button" onClick={() => setEditor({ mode: "edit", item })} className="flex min-h-11 flex-1 items-center text-left font-bold">
          {item.title}
        </button>
      ) : (
        <span className="flex-1 font-bold">{item.title}</span>
      )}
      {itinerary.canEdit && (
        <button type="button" onClick={() => onPlace(item)} aria-label={`Add ${item.title} to a day`} className="flex size-11 items-center justify-center rounded-sm text-plum hover:bg-blush">
          <Plus />
        </button>
      )}
    </div>
  );
}
