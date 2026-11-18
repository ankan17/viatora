/** What every model provider is reduced to, so one loop and one set of checks can run against all of them. */

export type ToolDef = { name: string; description: string; schema: Record<string, unknown> };
export type Call = { id: string; name: string; input: unknown };
export type CallResult = { id: string; name: string; content: string; isError: boolean };

/** `raw` is the provider's own form of the reply (reasoning and signatures included), sent back untouched on the next step. */
export type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; calls: Call[]; raw: unknown }
  | { role: "tool"; results: CallResult[] };

/** Token counts, normalised. `input` includes the cached and cache-written tokens; `output` includes reasoning. */
export type Usage = { input: number; cachedInput: number; cacheWrite: number; output: number; reasoning: number };
export const noUsage = (): Usage => ({ input: 0, cachedInput: 0, cacheWrite: 0, output: 0, reasoning: 0 });
export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  cachedInput: a.cachedInput + b.cachedInput,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  output: a.output + b.output,
  reasoning: a.reasoning + b.reasoning,
});

export type Effort = "low" | "medium" | "high";

export type StepResult = {
  text: string;
  calls: Call[];
  raw: unknown;
  usage: Usage;
  /** "tool" means it wants its calls run; "length" means it was cut off; "refusal" means it declined. */
  stop: "end" | "tool" | "length" | "refusal" | "other";
};

export interface Provider {
  /** "anthropic:claude-opus-5-5" */
  id: string;
  step(req: { system: string; tools: ToolDef[]; messages: Msg[] }): Promise<StepResult>;
}
