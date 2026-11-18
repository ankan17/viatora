"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { undo } from "@/app/trips/[tripId]/actions";
import { useTrip } from "@/components/itinerary/trip-context";
import { buttonClass } from "@/components/ui/button";
import { ArrowUp, Stop } from "@/components/ui/icons";
import type { TurnEvent } from "@/lib/agent/events";
import { appendMessage, mergeMessages, type ChatEdit, type ChatMessage } from "@/lib/agent/messages";
import { MAX_MESSAGE_LENGTH } from "@/lib/agent/model";
import { cn } from "@/lib/cn";

/** The turn in flight: what the traveller sent and the reply as it arrives. */
type Pending = { sent: string | null; text: string; edits: ChatEdit[] };

/**
 * The chat with the planning agent. The server's list of messages is the truth
 * and replaces local copies whenever the page refreshes; in between, the turn
 * in flight is drawn from the stream.
 */
export function Chat({ initialMessages }: { initialMessages: ChatMessage[] }) {
  const { itinerary, day, flash } = useTrip();
  const router = useRouter();
  const trip = itinerary.trip;

  const [messages, setMessages] = useState(initialMessages);
  const [synced, setSynced] = useState(initialMessages);
  // Ids of messages that arrived over the stream in this session.
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  if (synced !== initialMessages) {
    // A refresh brought the stored list.
    setSynced(initialMessages);
    setMessages((local) => mergeMessages(initialMessages, local, added));
  }
  const arrived = (message: ChatMessage) => {
    setAdded((ids) => new Set(ids).add(message.id));
    setMessages((list) => appendMessage(list, message));
  };

  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  // Leaving the page ends the turn in flight, like Stop.
  useEffect(() => () => abort.current?.abort(), []);

  // Keep the newest message in view as it arrives.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending?.text, pending?.edits.length, error]);

  async function send(text: string) {
    text = text.trim();
    if (!text || pending) return;
    setDraft("");
    setError(null);
    setPending({ sent: text, text: "", edits: [] });
    const controller = new AbortController();
    abort.current = controller;
    let reply: Pending = { sent: text, text: "", edits: [] };
    let finished = false;

    const handle = (event: TurnEvent) => {
      if (event.type === "user") {
        reply = { ...reply, sent: null };
        arrived(event.message);
      } else if (event.type === "text") {
        reply = { ...reply, text: reply.text + event.delta };
      } else if (event.type === "edit") {
        reply = { ...reply, edits: [...reply.edits, { summary: event.summary }] };
        if (event.itemId) flash(event.itemId);
        router.refresh(); // the itinerary beside the chat follows each edit
      } else if (event.type === "error") {
        setError(event.message);
      } else {
        finished = true;
        if (event.message) arrived(event.message);
      }
      if (!finished) setPending(reply);
    };

    try {
      const res = await fetch(`/api/trips/${trip.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dayId: day?.id ?? null }),
        signal: controller.signal,
      });
      if (res.redirected || res.status === 401) throw new SendError("You've been signed out. Sign in again to keep chatting.");
      if (!res.ok || !res.body) throw new SendError("That didn't send. Try again.");

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line) handle(JSON.parse(line) as TurnEvent);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof SendError ? e.message : "The connection dropped. Check the plan, then try again.");
    } finally {
      // Not stored (stopped early, or it failed before saving): give the words back.
      if (reply.sent) setDraft((current) => current || reply.sent!);
      if (!finished) {
        // Stopped or cut off. Show what arrived until the stored reply replaces it;
        // the server stores it a moment after it notices, so look more than once.
        if (reply.text || reply.edits.length) {
          setMessages((m) => [
            ...m,
            { id: `local-${Date.now()}`, role: "assistant", text: reply.text, edits: reply.edits, batchId: null, undone: false },
          ]);
        }
        for (const delay of [800, 2_500, 6_000]) setTimeout(() => router.refresh(), delay);
      }
      setPending(null);
      abort.current = null;
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends with a keyboard; on touch screens it stays a new line.
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    send(draft);
  };

  const empty = messages.length === 0 && !pending;
  const place = trip.destination ?? "this trip";
  const dayName = day ? `Day ${day.number}` : "your trip";
  const suggestions = [
    day ? `Suggest a plan for Day ${day.number}` : "Suggest a plan",
    "Add a few ideas to pick from",
    "What should we sort out first?",
  ];

  return (
    <section aria-label="Chat" className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center">
            <h1 className="text-title">Let&apos;s plan {place}</h1>
            <p className="text-body text-muted">
              {itinerary.canEdit
                ? "Tell me what you'd like to do and I'll add it to the plan. Anything I change, you can undo."
                : "You can view this trip. Someone who can edit it can plan here by chat."}
            </p>
            {itinerary.canEdit && (
              <ul className="flex flex-col items-center gap-2 pt-1">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => {
                        input.current?.focus(); // the button is about to go
                        send(s);
                      }}
                      className={buttonClass("secondary", "rounded-lg font-normal")}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <h1 className="sr-only">{trip.name}</h1>
            {/* A reply is announced once it is whole, not word by word. */}
            <div role="log" aria-label="Conversation" aria-busy={pending !== null} className="mx-auto mt-auto w-full max-w-2xl">
              <ol className="flex flex-col gap-3">
                {messages.map((m) => (
                  <Message key={m.id} message={m} tripId={trip.id} canUndo={itinerary.canEdit} />
                ))}
                {pending?.sent && <Bubble role="user" text={pending.sent} />}
                {pending && (
                  <li className="flex flex-col items-start gap-2">
                    <span className="sr-only">Viatora:</span>
                    {pending.text ? (
                      <Text role="assistant" text={pending.text} />
                    ) : (
                      <p className="animate-pulse px-1 text-caption text-muted">Thinking…</p>
                    )}
                    {pending.edits.length > 0 && <ChangeCard edits={pending.edits} />}
                  </li>
                )}
              </ol>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="mx-auto mt-3 w-full max-w-2xl rounded-md bg-blush px-3 py-2 text-caption text-plum">
            {error}
          </p>
        )}
      </div>

      {itinerary.canEdit && (
        <form onSubmit={onSubmit} className="border-t border-hairline bg-raised px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
          <div className="mx-auto flex max-w-2xl items-end gap-1 rounded-lg border border-outline bg-raised py-1 pl-4 pr-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-plum">
            <textarea
              ref={input}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MAX_MESSAGE_LENGTH}
              aria-label="Message"
              placeholder={`Ask about ${dayName}…`}
              className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-body text-ink outline-none [field-sizing:content] placeholder:text-muted"
            />
            {pending ? (
              <button
                type="button"
                onClick={() => abort.current?.abort()}
                aria-label="Stop"
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-outline text-ink hover:bg-blush"
              >
                <Stop width={18} height={18} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Send"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-plum text-on-plum transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <ArrowUp width={20} height={20} />
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

class SendError extends Error {}

function Text({ role, text }: { role: ChatMessage["role"]; text: string }) {
  return (
    <p
      className={cn(
        "max-w-[85%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-body",
        role === "user" ? "bg-plum text-on-plum" : "border border-hairline bg-raised text-ink",
      )}
    >
      {text}
    </p>
  );
}

function Bubble({ role, text }: { role: ChatMessage["role"]; text: string }) {
  return (
    <li className={cn("flex flex-col gap-2", role === "user" ? "items-end" : "items-start")}>
      <span className="sr-only">{role === "user" ? "You:" : "Viatora:"}</span>
      <Text role={role} text={text} />
    </li>
  );
}

function Message({ message, tripId, canUndo }: { message: ChatMessage; tripId: string; canUndo: boolean }) {
  if (message.role === "user") return <Bubble role="user" text={message.text} />;
  return (
    <li className="flex flex-col items-start gap-2">
      <span className="sr-only">Viatora:</span>
      {message.text && <Text role="assistant" text={message.text} />}
      {message.edits.length > 0 && (
        <ChangeCard edits={message.edits} tripId={tripId} batchId={canUndo ? message.batchId : null} undone={message.undone} />
      )}
    </li>
  );
}

/** What a reply changed, with one Undo for all of it. */
function ChangeCard({ edits, tripId, batchId, undone }: { edits: ChatEdit[]; tripId?: string; batchId?: string | null; undone?: boolean }) {
  const [isUndone, setUndone] = useState(undone ?? false);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, startTransition] = useTransition();
  const done = isUndone || undone;

  const onUndo = () => {
    if (!tripId || !batchId) return;
    setProblem(null);
    startTransition(async () => {
      const res = await undo(tripId, batchId);
      if (res.ok) setUndone(true);
      else setProblem(res.error);
    });
  };

  return (
    <div
      role="group"
      aria-label="Changes to the plan"
      className="flex w-full max-w-[85%] flex-col rounded-md border border-hairline bg-raised px-3 pt-2.5"
    >
      <p className="text-label text-muted">
        {done ? "Undone" : edits.length === 1 ? "Changed the plan" : `${edits.length} changes to the plan`}
      </p>
      <ul className={cn("flex flex-col gap-0.5 pt-1 text-body", done && "text-muted line-through")}>
        {edits.map((e, i) => (
          <li key={i}>{e.summary}</li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="pt-1 text-caption font-bold text-plum">
          {problem}
        </p>
      )}
      {tripId && batchId && !done ? (
        <button
          type="button"
          onClick={onUndo}
          disabled={working}
          className="-ml-3 min-h-11 self-start rounded-sm px-3 font-bold text-plum hover:bg-blush disabled:opacity-60"
        >
          {edits.length === 1 ? "Undo" : "Undo all"}
        </button>
      ) : (
        <span className="h-2.5" />
      )}
    </div>
  );
}
