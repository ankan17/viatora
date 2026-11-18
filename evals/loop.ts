import type { ServerClient } from "@/lib/supabase/server";
import { turnContext } from "@/lib/agent/context";
import { executeTool } from "@/lib/agent/execute";
import { newLookupSession } from "@/lib/agent/lookup-tools";
import { MAX_STEPS, SYSTEM_PROMPT } from "@/lib/agent/model";
import { tools } from "@/lib/agent/tools";
import { loadRecentChanges } from "@/lib/agent/store";
import type { EditContext } from "@/lib/itinerary/ops";
import { loadItinerary } from "@/lib/itinerary/snapshot";
import { addUsage, noUsage, type Msg, type Provider, type ToolDef, type Usage } from "./types";
import { batchClient, newBatchId, type World } from "./world";

export const toolDefs: ToolDef[] = tools.map((t) => ({
  name: t.name,
  description: t.description ?? "",
  schema: t.input_schema as Record<string, unknown>,
}));

export type ToolRecord = { name: string; input: unknown; isError: boolean; result: string };
export type TurnResult = {
  reply: string;
  steps: number;
  calls: ToolRecord[];
  edits: string[];
  usage: Usage;
  /** Model time only, in ms. */
  ms: number;
  /** False when it ran out of steps or room, or declined. */
  finished: boolean;
  error?: string;
};

/** Earlier chat turns go back as plain text, as the app does; the fresh snapshot carries the rest. */
export type History = { role: "user" | "assistant"; text: string }[];

/** One chat turn, the way `runTurn` does it: snapshot, model, tools, until the model stops. */
export async function runEvalTurn(provider: Provider, w: World, text: string, history: History, dayId: string | null): Promise<TurnResult> {
  const out: TurnResult = { reply: "", steps: 0, calls: [], edits: [], usage: noUsage(), ms: 0, finished: false };
  try {
    const db = w.db as unknown as ServerClient;
    const [itinerary, recent] = await Promise.all([loadItinerary(db, w.tripId), loadRecentChanges(db, w.tripId)]);
    if (!itinerary) throw new Error("trip not found");

    const batchId = newBatchId();
    const ctx: EditContext = {
      tripId: w.tripId,
      batchId,
      actor: "agent",
      db,
      writer: async (summary) => (await batchClient(w, batchId, summary)) as unknown as ServerClient,
    };
    const lookups = newLookupSession();
    const messages: Msg[] = [
      ...history.map((h): Msg =>
        h.role === "user" ? { role: "user", text: h.text } : { role: "assistant", text: h.text, calls: [], raw: null },
      ),
      { role: "user", text: `${turnContext(itinerary, recent, dayId)}\n\n${text}` },
    ];
    // An assistant history entry has no provider form of its own: send it as a plain model message.
    const plain = (m: Msg): Msg =>
      m.role === "assistant" && m.raw === null
        ? {
            ...m,
            raw: provider.id.startsWith("anthropic")
              ? [{ type: "text", text: m.text }]
              : provider.id.startsWith("openai")
                ? [{ role: "assistant", content: m.text }]
                : { role: "model", parts: [{ text: m.text }] },
          }
        : m;

    for (let step = 0; step < MAX_STEPS; step++) {
      const t0 = Date.now();
      const res = await provider.step({ system: SYSTEM_PROMPT, tools: toolDefs, messages: messages.map(plain) });
      out.ms += Date.now() - t0;
      out.steps++;
      out.usage = addUsage(out.usage, res.usage);
      if (res.text) out.reply += (out.reply ? "\n\n" : "") + res.text;
      if (res.stop === "length" || res.stop === "refusal") return out;
      if (res.calls.length === 0) {
        out.finished = true;
        return out;
      }
      messages.push({ role: "assistant", text: res.text, calls: res.calls, raw: res.raw });
      const results = [];
      for (const call of res.calls) {
        const r = await executeTool(call.name, call.input, { supabase: db, tripId: w.tripId, ctx, lookups });
        out.calls.push({ name: call.name, input: call.input, isError: r.isError, result: r.content });
        if (r.edit) out.edits.push(r.edit.summary);
        results.push({ id: call.id, name: call.name, content: r.content, isError: r.isError });
      }
      messages.push({ role: "tool", results });
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}
