import { type Usage } from "./types";

/** US dollars per million tokens. `cachedInput` is the rate for a cache hit; `cacheWrite` defaults to `input`. */
export type Price = { input: number; cachedInput: number; output: number; cacheWrite?: number };

/**
 * Checked 2026-11-18. Anthropic's come from its model docs. The others come from
 * third-party price lists that disagree in places, and the Gemini and GPT-5.5
 * cached rates are guesses. Check each against the provider's own pricing page
 * before trusting a number, or override one without editing this file:
 *   EVAL_PRICES="openai:gpt-5.4-mini=0.75,0.075,4.5;gemini:gemini-3.8-flash=0.75,0.075,3.75"
 * (input, cached input, output; add a fourth value for cache writes).
 * A model with no price is still run; its cost shows as "n/a".
 */
export const PRICES: Record<string, Price> = {
  "anthropic:claude-opus-5-5": { input: 4, cachedInput: 0.2, output: 20, cacheWrite: 5 },
  "openai:gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "openai:gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "openai:gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
  "gemini:gemini-3.8-flash": { input: 0.75, cachedInput: 0.075, output: 3.75 },
  "gemini:gemini-4-argon": { input: 2, cachedInput: 0.2, output: 10 },
  "mock:scripted": { input: 1, cachedInput: 0.1, output: 5 },
};

export function priceOf(model: string): Price | null {
  for (const entry of (process.env.EVAL_PRICES ?? "").split(";")) {
    const [id, nums] = entry.split("=");
    if (id?.trim() !== model || !nums) continue;
    const [input, cachedInput, output, cacheWrite] = nums.split(",").map(Number);
    if ([input, cachedInput, output].every(Number.isFinite))
      return { input, cachedInput, output, ...(Number.isFinite(cacheWrite) && { cacheWrite }) };
  }
  return PRICES[model] ?? null;
}

/** Dollars for these tokens, or null when the model has no price. */
export function costOf(price: Price | null, u: Usage): number | null {
  if (!price) return null;
  const fresh = Math.max(0, u.input - u.cachedInput - u.cacheWrite);
  return (
    (fresh * price.input + u.cachedInput * price.cachedInput + u.cacheWrite * (price.cacheWrite ?? price.input) + u.output * price.output) /
    1e6
  );
}
