"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { buttonClass } from "@/components/ui/button";
import { ChevronLeft, Chat, Close, Settings } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { DayChips } from "./day-chips";
import { dayTitle, DayView } from "./day-view";
import { ItineraryPanel } from "./itinerary-panel";
import { useTrip } from "./trip-context";

export type SheetState = "closed" | "peek" | "full";

/**
 * Phone only. "peek" slides the selected day up over the chat; "full" is the
 * whole itinerary with tabs. Drag the handle to move between them.
 */
export function ItinerarySheet({ state, setState, onTripDetails }: { state: SheetState; setState: (s: SheetState) => void; onTripDetails: () => void }) {
  const { itinerary, day } = useTrip();
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; id: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (state === "closed") return;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // Let open dialogs handle their own Escape.
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) setState(state === "full" ? "peek" : "closed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, setState]);

  const onDown = (e: PointerEvent) => {
    drag.current = { y: e.clientY, id: e.pointerId };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (drag.current) setOffset(e.clientY - drag.current.y);
  };
  const onUp = () => {
    if (!drag.current) return;
    if (offset > 80) setState(state === "full" ? "peek" : "closed");
    else if (offset < -80 && state === "peek") setState("full");
    drag.current = null;
    setDragging(false);
    setOffset(0);
  };

  const open = state !== "closed";
  const trip = itinerary.trip;

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 transition-[visibility] duration-200 lg:hidden",
        // Hidden (to screen readers too) once the slide-out finishes.
        open ? "visible" : "pointer-events-none invisible",
      )}
      inert={!open}
    >
      <button
        type="button"
        aria-label="Close itinerary"
        tabIndex={-1}
        onClick={() => setState("closed")}
        className={cn("absolute inset-0 bg-[rgb(42_24_35/0.5)] transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={state === "full" ? "Full itinerary" : "Itinerary"}
        style={{ transform: open ? `translateY(${Math.max(offset, state === "full" ? 0 : -60)}px)` : "translateY(100%)" }}
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col bg-ground outline-none",
          dragging ? "" : "transition-[transform,height,border-radius] duration-200 ease-out",
          state === "full" ? "h-dvh rounded-none" : "h-[79dvh] rounded-t-lg",
        )}
      >
        {state === "full" ? (
          <>
            <div className="flex shrink-0 items-center gap-1 bg-raised px-1 pb-1 pt-[max(env(safe-area-inset-top),8px)]">
              <button type="button" onClick={() => setState("closed")} aria-label="Back to chat" className="flex size-11 items-center justify-center rounded-sm hover:bg-blush">
                <ChevronLeft />
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-display text-heading">{trip.name}</span>
                <span className="truncate text-caption text-muted">{trip.destination ?? `${itinerary.days.length} days`}</span>
              </div>
              {itinerary.canEdit && (
                <button type="button" onClick={onTripDetails} aria-label="Trip details" className="flex size-11 items-center justify-center rounded-sm hover:bg-blush">
                  <Settings />
                </button>
              )}
            </div>
            <ItineraryPanel className="flex-1" />
            <div className="shrink-0 border-t border-hairline bg-raised px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
              <button
                type="button"
                onClick={() => setState("closed")}
                className="flex h-[52px] w-full items-center gap-2.5 rounded-lg border border-outline bg-ground px-4 text-left text-muted"
              >
                <Chat width={20} height={20} className="text-plum" />
                Ask about Day {day?.number ?? 1}
              </button>
            </div>
          </>
        ) : (
          <>
            <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="flex shrink-0 touch-none justify-center pb-1 pt-2">
              <span className="h-1 w-9 rounded-full bg-outline" aria-hidden />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 pl-4 pr-1">
              <h2 className="truncate text-title">{day ? dayTitle(day, trip.start_date) : trip.name}</h2>
              <button type="button" onClick={() => setState("closed")} aria-label="Back to chat" className="flex size-11 items-center justify-center rounded-sm hover:bg-blush">
                <Close />
              </button>
            </div>
            <div className="shrink-0 py-2">
              <DayChips />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">{day && <DayView day={day} showHeading={false} />}</div>
            <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2">
              <button type="button" onClick={() => setState("full")} className={buttonClass("primary", "w-full bg-ink text-ground")}>
                Open full itinerary
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

