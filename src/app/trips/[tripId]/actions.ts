"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { applyEdit, editContext, schemas, type EditResult, type OpName } from "@/lib/itinerary/ops";
import { createClient } from "@/lib/supabase/server";

const tripId = z.uuid();

/** Apply one itinerary edit by hand. */
export async function edit(trip: string, op: OpName, input: unknown): Promise<EditResult> {
  if (!(await getUser())) return { ok: false, error: "You've been signed out. Sign in again to keep editing." };
  if (!tripId.safeParse(trip).success || !(op in schemas)) return { ok: false, error: "That edit isn't valid." };
  const result = await applyEdit(editContext(trip, await createClient(), "user"), op, input);
  if (result.ok) refresh();
  return result;
}

export type UndoResult = { ok: true; message: string } | { ok: false; error: string };

export async function undo(trip: string, batchId: string): Promise<UndoResult> {
  if (!tripId.safeParse(trip).success || !z.uuid().safeParse(batchId).success) return { ok: false, error: "Nothing to undo." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_batch", { p_batch_id: batchId });
  if (error) return { ok: false, error: "That change can't be undone." };
  if (data === "conflict") return { ok: false, error: "Something else changed since. Undo that first." };
  refresh();
  return { ok: true, message: data === "already_undone" ? "Already undone." : "Undone." };
}
