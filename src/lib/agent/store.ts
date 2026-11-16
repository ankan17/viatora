import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerClient } from "@/lib/supabase/server";
import type { RecentChange } from "./context";
import { fromRow, partSchema, toParts, type ChatEdit, type ChatMessage } from "./messages";

// Reading and writing chat messages. The shapes and pure helpers are in messages.ts.

const SELECT = "id, role, parts, change_batch_id, batch:change_batches(undone_at)";

/** The latest messages of a trip's chat, oldest first. */
export async function loadMessages(supabase: ServerClient, tripId: string, limit = 60): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from("messages").select(SELECT).eq("trip_id", tripId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data.reverse().map(fromRow);
}

/** Stores the traveller's message, as them. Row level security decides whether they may. */
export async function saveUserMessage(supabase: ServerClient, row: { tripId: string; authorId: string; text: string }): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ trip_id: row.tripId, author_id: row.authorId, role: "user", parts: toParts(row.text) })
    .select(SELECT)
    .single();
  if (error) throw error;
  return fromRow(data);
}

/**
 * Stores a reply. Clients can't write these (see the messages policy), so this
 * uses the secret key. Only call it for a trip the signed-in user was just
 * allowed to chat on.
 */
export async function saveReply(row: { tripId: string; authorId: string; text: string; edits: ChatEdit[]; batchId: string | null }): Promise<ChatMessage> {
  const { data, error } = await createAdminClient()
    .from("messages")
    .insert({ trip_id: row.tripId, author_id: row.authorId, role: "assistant", parts: toParts(row.text, row.edits), change_batch_id: row.batchId })
    .select(SELECT)
    .single();
  if (error) throw error;
  return fromRow(data);
}

/** How many messages this person has sent in the last 24 hours. */
export async function countRecentMessages(supabase: ServerClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("author_id", userId).eq("role", "user").gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

/**
 * The last few changes to the trip, by hand or by chat, newest first. A reply
 * that made several edits is one batch; its edits are listed together.
 */
export async function loadRecentChanges(supabase: ServerClient, tripId: string, limit = 8): Promise<RecentChange[]> {
  const { data, error } = await supabase
    .from("change_batches")
    .select("id, actor, summary, undone_at, messages(parts)")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data
    .map((b) => {
      const parts = z.array(partSchema).safeParse(b.messages[0]?.parts);
      const edits = parts.success ? parts.data.flatMap((p) => (p.type === "edit" ? [p.summary] : [])) : [];
      return { actor: b.actor, summary: edits.length ? edits.join("; ") : b.summary, undone: Boolean(b.undone_at) };
    })
    .filter((c) => c.summary);
}
