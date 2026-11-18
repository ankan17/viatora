"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronUp, Settings } from "@/components/ui/icons";
import { Chat } from "@/components/chat/chat";
import type { ChatMessage } from "@/lib/agent/messages";
import { dayLabel } from "@/lib/dates";
import type { Itinerary } from "@/lib/itinerary/types";
import { ItemEditor } from "./item-editor";
import { ItineraryPanel } from "./itinerary-panel";
import { ItinerarySheet, type SheetState } from "./itinerary-sheet";
import { TripDetailsDialog } from "./trip-details";
import { TripProvider, UndoToast, useTrip } from "./trip-context";

export function TripScreen({ itinerary, messages }: { itinerary: Itinerary; messages: ChatMessage[] }) {
  return (
    <TripProvider itinerary={itinerary}>
      <Screen messages={messages} />
      <ItemEditor />
      <UndoToast />
    </TripProvider>
  );
}

function Screen({ messages }: { messages: ChatMessage[] }) {
  const { itinerary, day } = useTrip();
  const [sheet, setSheet] = useState<SheetState>("closed");
  const [details, setDetails] = useState(false);
  const trip = itinerary.trip;
  const scope = day ? [dayLabel(trip.start_date, day.number), day.base_city].filter(Boolean).join(" · ") : "";

  return (
    <div className="flex h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_440px]">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-1 border-b border-hairline bg-raised px-1 pb-1 pt-[max(env(safe-area-inset-top),4px)]">
          <Link
            href="/trips"
            aria-label="Your trips"
            className="flex size-11 shrink-0 items-center justify-center rounded-sm hover:bg-blush"
          >
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
            <button
              type="button"
              onClick={() => setDetails(true)}
              aria-label="Trip details"
              className="hidden size-11 shrink-0 items-center justify-center rounded-sm hover:bg-blush lg:flex"
            >
              <Settings />
            </button>
          )}
        </header>

        <Chat initialMessages={messages} />
      </div>

      <aside aria-label="Itinerary" className="hidden min-h-0 border-l border-hairline bg-ground lg:flex lg:flex-col">
        <ItineraryPanel className="flex-1" />
      </aside>

      <ItinerarySheet state={sheet} setState={setSheet} onTripDetails={() => setDetails(true)} />
      <TripDetailsDialog open={details} onClose={() => setDetails(false)} />
    </div>
  );
}
