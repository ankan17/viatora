import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { applyEdit, editContext } from "@/lib/itinerary/ops";
import { loadItinerary } from "@/lib/itinerary/snapshot";
import type { ServerClient } from "@/lib/supabase/server";
import { turnContext } from "./context";
import type { TurnEvent } from "./events";
import { loadMessages, loadRecentChanges, saveMessage, toHistory, toParts, type ChatEdit } from "./messages";
import { EFFORT, HISTORY_LIMIT, MAX_STEPS, MAX_TOKENS, MODEL, SYSTEM_PROMPT } from "./model";
import { isToolName, ToolInputError, toOp, tools } from "./tools";

let client: Anthropic | undefined;
/** Created on first use, so a missing key fails a chat turn rather than the build. */
const anthropic = () => (client ??= new Anthropic());

type Turn = {
  supabase: ServerClient;
  userId: string;
  tripId: string;
  text: string;
  /** The day on the traveller's screen. */
  dayId: string | null;
  signal: AbortSignal;
  emit: (event: TurnEvent) => void;
};

/**
 * One chat turn: stores the traveller's message, lets the model answer and call
 * edit tools until it is done, then stores the reply. Every edit in the turn
 * joins one change batch, so the reply's card undoes them together.
 */
export async function runTurn({ supabase, userId, tripId, text, dayId, signal, emit }: Turn): Promise<void> {
  const itinerary = await loadItinerary(supabase, tripId);
  if (!itinerary) return emit({ type: "error", message: "We can't find that trip." });
  if (!itinerary.canEdit) return emit({ type: "error", message: "You can view this trip but not edit it, so chat is off." });

  const [earlier, recent] = await Promise.all([loadMessages(supabase, tripId, HISTORY_LIMIT), loadRecentChanges(supabase, tripId)]);
  emit({ type: "user", message: await saveMessage(supabase, { tripId, authorId: userId, role: "user", parts: toParts(text) }) });

  const history = toHistory(earlier);
  while (history[0]?.role === "assistant") history.shift(); // a conversation starts with the traveller
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    {
      role: "user",
      content: [
        { type: "text", text: turnContext(itinerary, recent, dayId) },
        { type: "text", text },
      ],
    },
  ];

  const ctx = editContext(tripId, supabase, "agent");
  const edits: ChatEdit[] = [];
  let reply = "";
  let paragraphBreak = false;
  const say = (delta: string) => {
    if (paragraphBreak && reply) delta = `\n\n${delta}`;
    paragraphBreak = false;
    reply += delta;
    emit({ type: "text", delta });
  };

  async function runTool(block: Anthropic.Beta.BetaToolUseBlock): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    const fail = (message: string) => ({ type: "tool_result" as const, tool_use_id: block.id, is_error: true, content: message });
    if (!isToolName(block.name)) return fail(`There is no tool called ${block.name}.`);
    try {
      // Read fresh each time: an earlier edit in this turn may have renumbered the days.
      const [days, trip] = await Promise.all([
        supabase.from("days").select("id, number").eq("trip_id", tripId).order("number"),
        supabase.from("trips").select("currency").eq("id", tripId).single(),
      ]);
      if (days.error || trip.error) throw days.error ?? trip.error;
      const { op, input } = toOp(block.name, block.input, {
        dayIds: new Map(days.data.map((d) => [d.number, d.id])),
        currency: trip.data.currency,
      });
      const result = await applyEdit(ctx, op, input);
      if (!result.ok) return fail(result.error);

      edits.push({ summary: result.summary });
      emit({ type: "edit", summary: result.summary, itemId: result.id });
      const extra =
        op === "addItem"
          ? ` The new item's id is ${result.id}.`
          : op === "addDay" || op === "removeDay" || op === "moveDay"
            ? " Days have been renumbered; use the new numbers from here on."
            : "";
      return { type: "tool_result", tool_use_id: block.id, content: `${result.summary}.${extra}` };
    } catch (e) {
      if (e instanceof ToolInputError) return fail(e.message);
      throw e;
    }
  }

  let failure: string | null = null;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = anthropic().beta.messages.stream(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          output_config: { effort: EFFORT },
          system: SYSTEM_PROMPT,
          tools,
          messages,
          // Within a turn each step re-sends everything before it; cache that prefix.
          cache_control: { type: "ephemeral" },
          // If the model declines for policy reasons, the API retries on its default fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal },
      );
      stream.on("text", say);
      const message = await stream.finalMessage();
      paragraphBreak = true;

      if (message.stop_reason === "refusal") {
        if (!reply) say("I can't help with that one. Is there something else about the trip I can do?");
        break;
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        continue;
      }
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (calls.length === 0) break;
      if (message.stop_reason === "max_tokens") {
        // The last tool input may be cut short; don't run it.
        failure = "That was more than I could do in one go. Try asking for a smaller piece.";
        break;
      }

      messages.push({ role: "assistant", content: message.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      // One at a time and in order: positions and day numbers depend on the edits before.
      for (const call of calls) results.push(await runTool(call));
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    if (!signal.aborted) {
      console.error("chat turn failed:", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
      failure = describeFailure(e);
    }
  }

  if (!reply.trim() && edits.length && !failure) say("Done. The changes are listed below.");

  // Stored even after a failure or a stop, so edits that did land keep their undo card.
  let stored = null;
  if (reply.trim() || edits.length) {
    const batch = edits.length ? await supabase.from("change_batches").select("id").eq("id", ctx.batchId).maybeSingle() : null;
    stored = await saveMessage(supabase, {
      tripId,
      authorId: userId,
      role: "assistant",
      parts: toParts(reply, edits),
      batchId: batch?.data?.id ?? null,
    });
  }
  if (failure) emit({ type: "error", message: failure });
  emit({ type: "done", message: stored });
}

function describeFailure(e: unknown): string {
  if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529)) {
    return "I'm getting a lot of requests right now. Try again in a moment.";
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return "Chat isn't set up on this server yet.";
  }
  if (e instanceof Anthropic.APIConnectionError) return "I couldn't reach the planner just now. Check your connection and try again.";
  if (e instanceof Anthropic.APIError) return "Something went wrong on my side. Try again.";
  // The SDK throws a plain AnthropicError when it has no credentials at all.
  if (e instanceof Anthropic.AnthropicError) return "Chat isn't set up on this server yet.";
  return "Something went wrong on my side. Try again.";
}
