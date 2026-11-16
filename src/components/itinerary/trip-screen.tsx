"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronUp, Settings } from "@/components/ui/icons";
import { dayLabel } from "@/lib/dates";
import type { Itinerary } from "@/lib/itinerary/types";
import { ItemEditor } from "./item-editor";
import { ItineraryPanel } from "./itinerary-panel";
import { ItinerarySheet, type SheetState } from "./itinerary-sheet";
import { TripDetailsDialog } from "./trip-details";
import { TripProvider, UndoToast, useTrip } from "./trip-context";

export function TripScreen({ itinerary }: { itinerary: Itinerary }) {
  return (
    <TripProvider itinerary={itinerary}>
      <Screen />
      <ItemEditor />
      <UndoToast />
    </TripProvider>
  );
}

function Screen() {
  const { itinerary, day } = useTrip();
  const [sheet, setSheet] = useState<SheetState>("closed");
  const [details, setDetails] = useState(false);
  const trip = itinerary.trip;
  const scope = day ? [dayLabel(trip.start_date, day.number), day.base_city].filter(Boolean).join(" · ") : "";

  return (
    <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-1 border-b border-hairline bg-raised px-1 pb-1 pt-[max(env(safe-area-inset-top),4px)]">
          <Link href="/trips" aria-label="Your trips" className="flex size-11 shrink-0 items-center justify-center rounded-sm hover:bg-blush">
            <ChevronLeft />
          </Link>
          {/* Pinned bar: trip and day in scope. On phone it opens the itinerary sheet. */}
          <button
            type="button"
            onClick={() => setSheet("peek")}
            aria-expanded={sheet !== "closed"}
            aria-label={`${trip.name}, ${scope}. Show itinerary`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-sm px-1 text-left hover:bg-blush lg:pointer-events-none"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-display text-heading">{trip.name}</span>
              <span className="truncate text-caption text-muted">{scope}</span>
            </span>
            <ChevronUp className="shrink-0 text-plum lg:hidden" />
          </button>
          {itinerary.canEdit && (
            <button type="button" onClick={() => setDetails(true)} aria-label="Trip details" className="hidden size-11 shrink-0 items-center justify-center rounded-sm hover:bg-blush lg:flex">
              <Settings />
            </button>
          )}
        </header>

        <section aria-label="Chat" className="flex flex-1 flex-col items-center justify-center gap-2 overflow-y-auto px-4 py-6 text-center">
          <h1 className="text-title">Let&apos;s plan {trip.destination ?? "this trip"}</h1>
          <p className="max-w-sm text-body text-muted">
            Planning by chat is on its way. For now, tap the bar above to build your days by hand.
          </p>
        </section>

        <div className="border-t border-hairline bg-raised px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
          <div className="flex min-h-11 items-center rounded-lg border border-outline px-4 text-body text-muted" aria-disabled>
            Ask about {day ? `Day ${day.number}` : "your trip"}…
          </div>
        </div>
      </div>

      <aside aria-label="Itinerary" className="hidden min-h-0 border-l border-hairline bg-ground lg:flex lg:flex-col">
        <ItineraryPanel className="flex-1" />
      </aside>

      <ItinerarySheet state={sheet} setState={setSheet} onTripDetails={() => setDetails(true)} />
      <TripDetailsDialog open={details} onClose={() => setDetails(false)} />
    </div>
  );
}
