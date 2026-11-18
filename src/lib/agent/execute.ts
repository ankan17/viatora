import "server-only";
import { applyEdit, type EditContext } from "@/lib/itinerary/ops";
import type { ServerClient } from "@/lib/supabase/server";
import { runLookup, type LookupSession } from "./lookup-tools";
import { isLookupName, isToolName, ToolInputError, toOp } from "./tools";

export type ToolOutcome = {
  /** What goes back to the model. */
  content: string;
  /** True when the model should see it as an error. */
  isError: boolean;
  /** Set when the call changed the plan. */
  edit?: { summary: string; itemId?: string };
};

type Deps = { supabase: ServerClient; tripId: string; ctx: EditContext; lookups: LookupSession };

/**
 * Runs one tool call the model made: a lookup, or an edit through the same ops
 * the app's own screens use. Shared by the chat turn and the model evals, so
 * both see exactly the same results.
 */
export async function executeTool(name: string, input: unknown, { supabase, tripId, ctx, lookups }: Deps): Promise<ToolOutcome> {
  const fail = (content: string): ToolOutcome => ({ content, isError: true });
  if (!isToolName(name) && !isLookupName(name)) return fail(`There is no tool called ${name}.`);
  try {
    if (isLookupName(name)) {
      return { content: await runLookup(name, input, { supabase, tripId, session: lookups }), isError: false };
    }
    // Read fresh each time: an earlier edit in this turn may have renumbered the days.
    const [days, trip] = await Promise.all([
      supabase.from("days").select("id, number").eq("trip_id", tripId).order("number"),
      supabase.from("trips").select("currency").eq("id", tripId).single(),
    ]);
    if (days.error || trip.error) throw days.error ?? trip.error;
    const { op, input: parsed } = toOp(name, input, {
      dayIds: new Map(days.data.map((d) => [d.number, d.id])),
      currency: trip.data.currency,
    });
    const result = await applyEdit(ctx, op, parsed);
    if (!result.ok) return fail(result.error);

    const extra =
      op === "addItem"
        ? ` The new item's id is ${result.id}.`
        : op === "addBooking"
          ? ` The new booking's id is ${result.id}.`
          : op === "addDay" || op === "removeDay" || op === "moveDay"
            ? " Days have been renumbered; use the new numbers from here on."
            : "";
    return { content: `${result.summary}.${extra}`, isError: false, edit: { summary: result.summary, itemId: result.id } };
  } catch (e) {
    if (e instanceof ToolInputError) return fail(e.message);
    throw e;
  }
}
