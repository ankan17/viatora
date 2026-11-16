"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { useTrip } from "./trip-context";

export function DayChips() {
  const { itinerary, day, selectDay } = useTrip();
  const ref = useRef<HTMLDivElement>(null);

  // Keep the selected chip in view as days change.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [day?.id]);

  return (
    <div ref={ref} role="group" aria-label="Days" className="flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
      {itinerary.days.map((d) => (
        <button
          key={d.id}
          type="button"
          aria-pressed={d.id === day?.id}
          onClick={() => selectDay(d.id)}
          className={cn(
            "h-11 min-w-[64px] shrink-0 rounded-lg border px-4 text-caption font-bold",
            d.id === day?.id ? "border-ink bg-ink text-ground" : "border-outline bg-raised text-ink hover:bg-blush",
          )}
        >
          Day {d.number}
        </button>
      ))}
    </div>
  );
}
