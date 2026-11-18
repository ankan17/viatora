import { describeTrip } from "@/lib/agent/context";
import type { Itinerary } from "@/lib/itinerary/types";
import { makeProvider } from "./providers";
import { costOf, priceOf } from "./pricing";
import { parseSpec } from "./providers";
import type { Provider } from "./types";

const SYSTEM = `You grade one reply from a trip-planning assistant. You get what the traveller asked, what the assistant said, the plan afterwards, and a rubric. Score the reply and the plan together from 1 (poor) to 5 (excellent) against the rubric. Also penalise a reply that isn't warm, brief and plain text (no Markdown, no emoji), or that claims something the plan doesn't show. Answer with only JSON: {"score": <1-5>, "reason": "<one sentence>"}`;

let judge: Provider | undefined;

export const judgeSpec = () => process.env.EVAL_JUDGE;

/** An optional model-as-judge score, for the things a rule can't check. Its cost is reported apart from the models under test. */
export async function judgeReply(
  rubric: string,
  asked: string,
  reply: string,
  after: Itinerary,
): Promise<{ score: number; reason: string; cost: number } | null> {
  const spec = judgeSpec();
  if (!spec) return null;
  judge ??= makeProvider(spec);
  const res = await judge.step({
    system: SYSTEM,
    tools: [],
    messages: [
      {
        role: "user",
        text: `Rubric: ${rubric}\n\nThe traveller asked: ${asked}\n\nThe assistant said: ${reply || "(nothing)"}\n\nThe plan afterwards:\n${describeTrip(after)}`,
      },
    ],
  });
  const parsed = /\{[\s\S]*\}/.exec(res.text);
  const cost = costOf(priceOf(parseSpec(spec).price), res.usage) ?? 0;
  try {
    const j = JSON.parse(parsed?.[0] ?? "");
    return { score: Math.min(5, Math.max(1, Number(j.score))), reason: String(j.reason ?? ""), cost };
  } catch {
    return { score: NaN, reason: `unreadable judge answer: ${res.text.slice(0, 80)}`, cost };
  }
}
