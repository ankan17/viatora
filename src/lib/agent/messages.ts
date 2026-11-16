import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Json } from "@/lib/database.types";
import type { ServerClient } from "@/lib/supabase/server";
import type { RecentChange } from "./context";

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
const partSchema = z.discriminatedUnion("type", [
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

type Row = { id: string; role: "user" | "assistant"; parts: Json; change_batch_id: string | null; batch: { undone_at: string | null } | null };

export function fromRow(row: Row): ChatMessage {
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

const SELECT = "id, role, parts, change_batch_id, batch:change_batches(undone_at)";

/** The latest messages of a trip's chat, oldest first. */
export async function loadMessages(supabase: ServerClient, tripId: string, limit = 60): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from("messages").select(SELECT).eq("trip_id", tripId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data.reverse().map(fromRow);
}

export async function saveMessage(
  supabase: ServerClient,
  row: { tripId: string; authorId: string; role: "user" | "assistant"; parts: MessagePart[]; batchId?: string | null },
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ trip_id: row.tripId, author_id: row.authorId, role: row.role, parts: row.parts, change_batch_id: row.batchId ?? null })
    .select(SELECT)
    .single();
  if (error) throw error;
  return fromRow(data);
}

/**
 * Earlier turns as the model sees them: words only. What the edits did is in
 * the trip snapshot, which is why tool calls aren't replayed.
 */
export function toHistory(messages: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  return messages.filter((m) => m.text.trim()).map((m) => ({ role: m.role, content: m.text }));
}

/** The last few changes to the trip, by hand or by chat, newest first. */
export async function loadRecentChanges(supabase: ServerClient, tripId: string, limit = 8): Promise<RecentChange[]> {
  const { data, error } = await supabase
    .from("change_batches")
    .select("actor, summary, undone_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.filter((b) => b.summary).map((b) => ({ actor: b.actor, summary: b.summary, undone: Boolean(b.undone_at) }));
}
