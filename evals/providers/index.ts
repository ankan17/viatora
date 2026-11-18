import { EFFORT } from "@/lib/agent/model";
import type { Effort, Provider } from "../types";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { mockProvider } from "./mock";
import { openaiProvider } from "./openai";

/** "openai:gpt-5.4-mini", or with a thinking depth: "openai:gpt-5.4-mini@low". Defaults to the app's own setting. */
export function parseSpec(spec: string): { provider: string; model: string; effort: Effort; price: string } {
  const [id, effort = EFFORT] = spec.split("@");
  const [provider, ...rest] = id.split(":");
  if (!["low", "medium", "high"].includes(effort)) throw new Error(`Unknown effort "${effort}" in ${spec}. Use low, medium or high.`);
  return { provider, model: rest.join(":"), effort: effort as Effort, price: id };
}

export function makeProvider(spec: string): Provider {
  const { provider, model, effort } = parseSpec(spec);
  const made =
    provider === "anthropic"
      ? anthropicProvider(model, effort)
      : provider === "openai"
        ? openaiProvider(model, effort)
        : provider === "gemini"
          ? geminiProvider(model, effort)
          : provider === "mock"
            ? mockProvider()
            : null;
  if (!made) throw new Error(`Unknown provider "${provider}" in ${spec}. Use anthropic, openai, gemini or mock.`);
  return { ...made, id: spec };
}

const KEYS: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  mock: [],
};

/** The keys a spec needs that aren't set, so a run fails before it spends anything. */
export function missingKey(spec: string): string | null {
  const need = KEYS[parseSpec(spec).provider] ?? [];
  return need.length && !need.some((k) => process.env[k]) ? need[0] : null;
}
