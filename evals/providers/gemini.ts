import { GoogleGenAI, ThinkingLevel, type Content } from "@google/genai";
import { MAX_TOKENS } from "@/lib/agent/model";
import type { Effort, Msg, Provider, StepResult } from "../types";

const LEVEL: Record<Effort, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };

/** The model's own reply content goes back untouched, which keeps the thought signatures Gemini needs between tool calls. */
export function geminiProvider(model: string, effort: Effort): Provider {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY });
  const contents = (msgs: Msg[]): Content[] =>
    msgs.map((m) =>
      m.role === "user"
        ? { role: "user", parts: [{ text: m.text }] }
        : m.role === "assistant"
          ? (m.raw as Content)
          : {
              role: "user",
              parts: m.results.map((r) => ({
                functionResponse: { id: r.id, name: r.name, response: r.isError ? { error: r.content } : { output: r.content } },
              })),
            },
    );

  return {
    id: `gemini:${model}`,
    async step({ system, tools, messages }): Promise<StepResult> {
      const res = await ai.models.generateContent({
        model,
        contents: contents(messages),
        config: {
          systemInstruction: system,
          ...(tools.length && {
            tools: [
              { functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })) },
            ],
          }),
          thinkingConfig: { thinkingLevel: LEVEL[effort] },
          maxOutputTokens: MAX_TOKENS,
        },
      });
      const candidate = res.candidates?.[0];
      const calls = res.functionCalls ?? [];
      const parts = candidate?.content?.parts ?? [];
      const u = res.usageMetadata;
      // Gemini counts reasoning apart from the answer, and bills both as output.
      const reasoning = u?.thoughtsTokenCount ?? 0;
      return {
        text: parts.map((p) => (p.text && !p.thought ? p.text : "")).join(""),
        calls: calls.map((c, i) => ({ id: c.id ?? `call_${Date.now()}_${i}`, name: c.name ?? "", input: c.args ?? {} })),
        raw: candidate?.content ?? { role: "model", parts: [] },
        usage: {
          input: (u?.promptTokenCount ?? 0) + (u?.toolUsePromptTokenCount ?? 0),
          cachedInput: u?.cachedContentTokenCount ?? 0,
          cacheWrite: 0,
          output: (u?.candidatesTokenCount ?? 0) + reasoning,
          reasoning,
        },
        stop:
          candidate?.finishReason === "MAX_TOKENS"
            ? "length"
            : calls.length
              ? "tool"
              : candidate?.finishReason && candidate.finishReason !== "STOP"
                ? "refusal"
                : "end",
      };
    },
  };
}
