import OpenAI from "openai";
import type { ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import { MAX_TOKENS } from "@/lib/agent/model";
import type { Effort, Msg, Provider, StepResult } from "../types";

/**
 * Responses API, stateless: each step sends the whole conversation again, with
 * the model's own earlier output (reasoning included) as it came back, the same
 * way the app re-sends it to Anthropic.
 */
export function openaiProvider(model: string, effort: Effort): Provider {
  const client = new OpenAI();
  const input = (msgs: Msg[]): ResponseInputItem[] =>
    msgs.flatMap((m): ResponseInputItem[] =>
      m.role === "user"
        ? [{ role: "user", content: m.text }]
        : m.role === "assistant"
          ? (m.raw as ResponseInputItem[])
          : m.results.map((r) => ({ type: "function_call_output", call_id: r.id, output: r.isError ? `Error: ${r.content}` : r.content })),
    );

  return {
    id: `openai:${model}`,
    async step({ system, tools, messages }): Promise<StepResult> {
      const res = await client.responses.create({
        model,
        instructions: system,
        input: input(messages),
        ...(tools.length && {
          tools: tools.map((t) => ({
            type: "function" as const,
            name: t.name,
            description: t.description,
            parameters: t.schema,
            strict: false,
          })),
        }),
        reasoning: { effort },
        max_output_tokens: MAX_TOKENS,
        store: false,
        include: ["reasoning.encrypted_content"],
      });
      const calls = res.output.filter((o): o is Extract<ResponseOutputItem, { type: "function_call" }> => o.type === "function_call");
      const text = res.output
        .flatMap((o) => (o.type === "message" ? o.content : []))
        .map((c) => (c.type === "output_text" ? c.text : c.type === "refusal" ? c.refusal : ""))
        .join("");
      const u = res.usage;
      const refused = res.output.some((o) => o.type === "message" && o.content.some((c) => c.type === "refusal"));
      return {
        text,
        calls: calls.map((c) => ({ id: c.call_id, name: c.name, input: parseArgs(c.arguments) })),
        raw: res.output,
        usage: {
          input: u?.input_tokens ?? 0,
          cachedInput: u?.input_tokens_details?.cached_tokens ?? 0,
          cacheWrite: 0,
          output: u?.output_tokens ?? 0,
          reasoning: u?.output_tokens_details?.reasoning_tokens ?? 0,
        },
        stop: refused ? "refusal" : res.status === "incomplete" ? "length" : calls.length ? "tool" : "end",
      };
    },
  };
}

/** A malformed argument string reaches the tool as-is, so the model sees the validation error and can retry. */
function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
