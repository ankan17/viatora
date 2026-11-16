import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Json } from "@/lib/database.types";
import { HISTORY_MESSAGE_LENGTH } from "./model";

/** One applied edit, as shown on a change card. */
export type ChatEdit = { summary: string };

/** A stored chat message, shaped for the chat UI. */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  edits: ChatEdit[];
  /** The change batch behind the card, when the edits can be undone. */
  batchId: string | null;
  undone: boolean;
};

// messages.parts: text and the edits a reply made, in order.
export const partSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("edit"), summary: z.string() }),
]);
export type MessagePart = z.infer<typeof partSchema>;

export function toParts(text: string, edits: ChatEdit[] = []): MessagePart[] {
  const parts: MessagePart[] = [];
  if (text.trim()) parts.push({ type: "text", text: text.trim() });
  for (const e of edits) parts.push({ type: "edit", summary: e.summary });
  return parts;
}

export type MessageRow = { id: string; role: "user" | "assistant"; parts: Json; change_batch_id: string | null; batch: { undone_at: string | null } | null };

export function fromRow(row: MessageRow): ChatMessage {
  const parts = z.array(partSchema).safeParse(row.parts);
  const list = parts.success ? parts.data : [];
  return {
    id: row.id,
    role: row.role,
    text: list.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n\n"),
    edits: list.flatMap((p) => (p.type === "edit" ? [{ summary: p.summary }] : [])),
    batchId: row.change_batch_id,
    undone: Boolean(row.batch?.undone_at),
  };
}

/**
 * Earlier turns as the model sees them: words only. What the edits did is in
 * the trip snapshot, which is why tool calls aren't replayed. Starts with the
 * traveller, as a conversation must.
 */
export function toHistory(messages: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const clip = (t: string) => (t.length > HISTORY_MESSAGE_LENGTH ? `${t.slice(0, HISTORY_MESSAGE_LENGTH)}\n[…the rest of this message was left out]` : t);
  const turns = messages.filter((m) => m.text.trim()).map((m) => ({ role: m.role, content: clip(m.text) }));
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}

/**
 * The stored list from the server joined with what this session has added since.
 * `added` holds the ids of messages that arrived over the stream; anything else
 * in `local` is either already on the server or has scrolled out of its window.
 * Unsaved copies (a stopped reply) stay until the stored reply shows up.
 */
export function mergeMessages(server: ChatMessage[], local: ChatMessage[], added: ReadonlySet<string>): ChatMessage[] {
  const known = new Set(server.map((m) => m.id));
  const lastStored = server.at(-1);
  const replyArrived = lastStored?.role === "assistant" && !local.some((m) => m.id === lastStored.id);
  const extra = local.filter((m) => !known.has(m.id) && (isUnsaved(m) ? !replyArrived : added.has(m.id)));
  return [...server, ...extra];
}

export const isUnsaved = (m: ChatMessage) => m.id.startsWith("local-");

/** Adds a message unless it is already there. */
export const appendMessage = (list: ChatMessage[], message: ChatMessage) => (list.some((m) => m.id === message.id) ? list : [...list, message]);
