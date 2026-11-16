"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Close } from "./icons";

/**
 * Native modal dialog (focus trap, Escape, top layer). A bottom sheet on phone,
 * centred on wider screens.
 */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // The native close event arrives a task later. If the element is already open
  // again by then, the event is stale (we closed it, then something reopened it
  // straight away) and must not close the new one. Otherwise it's the person
  // closing it (Escape), which we only report if we still think we're open.
  const handleClose = () => {
    if (ref.current?.open) return;
    if (openRef.current) onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="dialog-title"
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-lg bg-ground p-0 text-ink backdrop:bg-[rgb(42_24_35/0.5)] sm:m-auto sm:max-w-md sm:rounded-lg"
    >
      {open && (
        <div className="flex flex-col gap-4 px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="dialog-title" className="text-title">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex size-11 items-center justify-center rounded-sm hover:bg-blush">
              <Close />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
