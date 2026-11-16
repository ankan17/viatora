"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { DayChips } from "./day-chips";
import { DayView, IdeasList } from "./day-view";
import { useTrip } from "./trip-context";

const TABS = [
  { id: "itinerary", label: "Itinerary" },
  { id: "packing", label: "Packing" },
  { id: "bookings", label: "Bookings" },
  { id: "budget", label: "Budget" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const LATER: Record<Exclude<Tab, "itinerary">, string> = {
  packing: "Packing lists, with the reason for each thing, are coming soon.",
  bookings: "Keep confirmations and links in one place. Coming soon.",
  budget: "See what the trip costs as you plan. Coming soon.",
};

/** The full itinerary: tabs, day chips, the day, and the ideas backlog. */
export function ItineraryPanel({ className }: { className?: string }) {
  const { day } = useTrip();
  const [tab, setTab] = useState<Tab>("itinerary");

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div role="tablist" aria-label="Trip lists" className="flex shrink-0 border-b border-hairline bg-raised">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "h-11 flex-1 border-b-[3px] text-caption font-bold",
              tab === t.id ? "border-plum text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {tab === "itinerary" ? (
          <>
            <div className="sticky top-0 z-10 bg-ground pb-1 pt-3">
              <DayChips />
            </div>
            <div className="flex flex-col gap-6 p-4">
              {day && <DayView day={day} />}
              <IdeasList />
            </div>
          </>
        ) : (
          <p className="p-6 text-center text-body text-muted">{LATER[tab]}</p>
        )}
      </div>
    </div>
  );
}
