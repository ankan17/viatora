import Anthropic from "@anthropic-ai/sdk";
import { MAX_TOKENS } from "@/lib/agent/model";
import type { Effort, Msg, Provider, StepResult } from "../types";

type Blocks = Anthropic.Beta.BetaContentBlock[];

/** The call the app makes (same cache and effort settings), minus the fallback beta. */
export function anthropicProvider(model: string, effort: Effort): Provider {
  const client = new Anthropic();
  const messages = (msgs: Msg[]): Anthropic.Beta.BetaMessageParam[] =>
    msgs.map((m) =>
      m.role === "user"
        ? { role: "user", content: m.text }
        : m.role === "assistant"
          ? { role: "assistant", content: m.raw as Blocks }
          : {
              role: "user",
              content: m.results.map((r) => ({
                type: "tool_result" as const,
                tool_use_id: r.id,
                content: r.content,
                ...(r.isError && { is_error: true }),
              })),
            },
    );

  return {
    id: `anthropic:${model}`,
    async step({ system, tools, messages: msgs }): Promise<StepResult> {
      const message = await client.beta.messages
        .stream({
          model,
          max_tokens: MAX_TOKENS,
          output_config: { effort },
          system,
          ...(tools.length && {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.schema as Anthropic.Beta.BetaTool.InputSchema,
            })),
          }),
          messages: messages(msgs),
          cache_control: { type: "ephemeral" },
        })
        .finalMessage();
      const u = message.usage;
      const cached = u.cache_read_input_tokens ?? 0;
      const written = u.cache_creation_input_tokens ?? 0;
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      return {
        text: message.content.map((b) => (b.type === "text" ? b.text : "")).join(""),
        calls: calls.map((c) => ({ id: c.id, name: c.name, input: c.input })),
        raw: message.content,
        // Anthropic reports reasoning inside output_tokens without a separate count.
        usage: {
          input: u.input_tokens + cached + written,
          cachedInput: cached,
          cacheWrite: written,
          output: u.output_tokens,
          reasoning: 0,
        },
        stop:
          message.stop_reason === "refusal"
            ? "refusal"
            : message.stop_reason === "max_tokens" || message.stop_reason === "model_context_window_exceeded"
              ? "length"
              : calls.length
                ? "tool"
                : "end",
      };
    },
  };
}
