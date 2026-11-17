"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { edit, undo } from "@/app/trips/[tripId]/actions";
import type { OpInput, OpName } from "@/lib/itinerary/ops";
import type { Day, Item, Itinerary } from "@/lib/itinerary/types";
import { Close } from "@/components/ui/icons";

type Toast = { id: number; message: string; batchId?: string; tone: "info" | "error" };
type EditorState = { mode: "new"; dayId: string | null } | { mode: "edit"; item: Item } | null;

type TripState = {
  itinerary: Itinerary;
  day: Day | null;
  selectDay: (id: string) => void;
  /** Applies an edit; resolves true on success. Shows the undo toast. */
  run: <N extends OpName>(op: N, input: OpInput<N>) => Promise<boolean>;
  pending: boolean;
  toast: Toast | null;
  dismissToast: () => void;
  undoLast: () => void;
  recentId: string | null;
  /** Mark an item as just changed, as an edit from chat does. */
  flash: (id: string) => void;
  editor: EditorState;
  setEditor: (s: EditorState) => void;
};

const Ctx = createContext<TripState | null>(null);

export function useTrip() {
  const v = use(Ctx);
  if (!v) throw new Error("useTrip outside TripProvider");
  return v;
}

export function TripProvider({ itinerary, children }: { itinerary: Itinerary; children: ReactNode }) {
  const [dayId, setDayId] = useState<string | null>(itinerary.days[0]?.id ?? null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<Toast | null>(null);
  const [recentId, setRecentId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const toastSeq = useRef(0);

  // Keep the selection on a day that still exists (e.g. after removing one).
  const day = itinerary.days.find((d) => d.id === dayId) ?? itinerary.days[0] ?? null;

  const show = useCallback((t: Omit<Toast, "id">) => setToast({ ...t, id: ++toastSeq.current }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.batchId ? 10_000 : 5_000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!recentId) return;
    const timer = setTimeout(() => setRecentId(null), 4_000);
    return () => clearTimeout(timer);
  }, [recentId]);

  const run = useCallback(
    <N extends OpName>(op: N, input: OpInput<N>) =>
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          const res = await edit(itinerary.trip.id, op, input);
          if (res.ok) {
            show({ message: res.summary, batchId: res.batchId, tone: "info" });
            setRecentId(res.id ?? null);
            if (op === "addDay" && res.id) setDayId(res.id);
          } else {
            show({ message: res.error, tone: "error" });
          }
          resolve(res.ok);
        });
      }),
    [itinerary.trip.id, show],
  );

  const undoLast = useCallback(() => {
    const batchId = toast?.batchId;
    if (!batchId) return;
    startTransition(async () => {
      const res = await undo(itinerary.trip.id, batchId);
      show(res.ok ? { message: res.message, tone: "info" } : { message: res.error, tone: "error" });
    });
  }, [itinerary.trip.id, show, toast?.batchId]);

  const value = useMemo<TripState>(
    () => ({
      itinerary,
      day,
      selectDay: setDayId,
      run,
      pending,
      toast,
      dismissToast: () => setToast(null),
      undoLast,
      recentId,
      flash: setRecentId,
      editor,
      setEditor,
    }),
    [itinerary, day, run, pending, toast, undoLast, recentId, editor],
  );

  return <Ctx value={value}>{children}</Ctx>;
}

export function UndoToast() {
  const { toast, undoLast, dismissToast, pending } = useTrip();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),12px)+72px)] z-50 flex justify-center px-4 lg:bottom-6"
    >
      {toast && (
        <div
          role="status"
          data-toast-id={toast.id}
          className={
            "pointer-events-auto flex min-h-12 max-w-md items-center gap-2 rounded-lg py-1 pl-4 pr-1 shadow-lg " +
            (toast.tone === "error" ? "bg-plum text-on-plum" : "bg-ink text-ground")
          }
        >
          <span className="text-body">{toast.message}</span>
          {toast.batchId ? (
            <button
              type="button"
              onClick={undoLast}
              disabled={pending}
              className="min-h-11 rounded-sm px-3 font-bold underline-offset-4 hover:underline disabled:opacity-60"
            >
              Undo
            </button>
          ) : (
            <button type="button" onClick={dismissToast} aria-label="Dismiss" className="min-h-11 min-w-11 rounded-sm px-2">
              <Close width={18} height={18} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
