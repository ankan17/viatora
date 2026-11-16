import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { applyEdit, editContext } from "@/lib/itinerary/ops";
import { loadItinerary } from "@/lib/itinerary/snapshot";
import type { ServerClient } from "@/lib/supabase/server";
import { turnContext } from "./context";
import type { TurnEvent } from "./events";
import { toHistory, type ChatEdit } from "./messages";
import { DAILY_MESSAGE_LIMIT, EFFORT, HISTORY_LIMIT, MAX_STEPS, MAX_TOKENS, MODEL, SYSTEM_PROMPT } from "./model";
import { countRecentMessages, loadMessages, loadRecentChanges, saveReply, saveUserMessage } from "./store";
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
  /** Aborts when the traveller presses Stop or leaves. */
  signal: AbortSignal;
  emit: (event: TurnEvent) => void;
};

type Block = Anthropic.Beta.BetaContentBlock;
type ToolUse = Anthropic.Beta.BetaToolUseBlock;

/**
 * One chat turn: stores the traveller's message, lets the model answer and call
 * edit tools until it is done, then stores the reply. Every edit in the turn
 * joins one change batch, so the reply's card undoes them together. Always ends
 * with a `done` event.
 */
export async function runTurn({ supabase, userId, tripId, text, dayId, signal, emit }: Turn): Promise<void> {
  const refuse = (message: string) => {
    emit({ type: "error", message });
    emit({ type: "done", message: null });
  };
  const itinerary = await loadItinerary(supabase, tripId);
  if (!itinerary) return refuse("We can't find that trip.");
  if (!itinerary.canEdit) return refuse("You can view this trip but not edit it, so chat is off.");
  if ((await countRecentMessages(supabase, userId)) >= DAILY_MESSAGE_LIMIT) {
    return refuse("That's the limit for today. You can keep planning by hand, and chat again tomorrow.");
  }

  const [earlier, recent] = await Promise.all([loadMessages(supabase, tripId, HISTORY_LIMIT), loadRecentChanges(supabase, tripId)]);
  // Stopped before anything was stored: the browser still has the draft.
  if (signal.aborted) return emit({ type: "done", message: null });
  emit({ type: "user", message: await saveUserMessage(supabase, { tripId, authorId: userId, text }) });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...toHistory(earlier),
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
  /** A closing line of our own, set apart from whatever the model wrote. */
  const note = (line: string) => {
    paragraphBreak = true;
    say(line);
  };

  async function runTool(block: ToolUse): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
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
  let finished = false; // the model ended its turn on its own
  try {
    for (let step = 0; step < MAX_STEPS && !signal.aborted; step++) {
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
        note(reply ? "I can't take that any further." : "I can't help with that one. Is there something else about the trip I can do?");
        finished = true;
        break;
      }
      const { calls, echo } = afterFallback(message.content);
      if (message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded") {
        // A tool input may be cut short, so nothing from this step runs.
        note(calls.length ? "That was more than I could do in one go. Ask for a smaller piece and I'll carry on." : "I ran out of room there. Ask me to continue.");
        finished = true;
        break;
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: echo });
        continue;
      }
      if (calls.length === 0) {
        finished = true;
        break;
      }

      messages.push({ role: "assistant", content: echo });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      // One at a time and in order: positions and day numbers depend on the edits before.
      for (const call of calls) {
        if (signal.aborted) break; // stopped: the edits not yet made stay unmade
        results.push(await runTool(call));
      }
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    if (!signal.aborted) {
      console.error("chat turn failed:", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
      failure = describeFailure(e);
    }
  }

  if (!failure && !signal.aborted) {
    if (!finished) note("That's as far as I can go in one reply. Ask me to continue and I'll pick up from here.");
    else if (!reply.trim()) note(edits.length ? "Done. The changes are listed below." : "I don't have anything to add to that. Could you put it another way?");
  }

  // Stored even after a failure or a stop, so edits that did land keep their undo card.
  let stored = null;
  try {
    if (reply.trim() || edits.length) {
      const batch = edits.length ? await supabase.from("change_batches").select("id").eq("id", ctx.batchId).maybeSingle() : null;
      stored = await saveReply({ tripId, authorId: userId, text: reply, edits, batchId: batch?.data?.id ?? null });
    }
  } catch (e) {
    console.error("chat reply not stored:", e);
    failure ??= "I couldn't save that reply. Reload to see where the plan stands.";
  }
  if (failure) emit({ type: "error", message: failure });
  emit({ type: "done", message: stored });
}

/**
 * When the API switched models part-way through a reply (a `fallback` block),
 * only what follows the switch counts: tool calls before it were the declined
 * model's and must not run, and its thinking and tool calls are left out when
 * the turn is sent back. The fallback block itself stays where it was.
 */
function afterFallback(content: Block[]): { calls: ToolUse[]; echo: Block[] } {
  const boundary = content.findLastIndex((b) => b.type === "fallback");
  const dropped = new Set(["thinking", "redacted_thinking", "tool_use"]);
  return {
    calls: content.filter((b, i): b is ToolUse => b.type === "tool_use" && i > boundary),
    echo: content.filter((b, i) => i >= boundary || !dropped.has(b.type)),
  };
}

function describeFailure(e: unknown): string {
  const generic = "Something went wrong on my side. Try again.";
  if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529)) {
    return "I'm getting a lot of requests right now. Try again in a moment.";
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "Chat isn't set up on this server yet.";
  if (e instanceof Anthropic.APIConnectionError) return "I couldn't reach the planner just now. Check your connection and try again.";
  if (e instanceof Anthropic.APIError) return generic;
  // No key, token or profile at all. The stream helper wraps every other kind of
  // error the same way (a dropped connection, a cut-off tool input), so the
  // message is the only thing that tells this one apart.
  if (e instanceof Error && /Could not resolve authentication method/.test(`${e.message} ${e.cause instanceof Error ? e.cause.message : ""}`)) {
    return "Chat isn't set up on this server yet.";
  }
  return generic;
}
