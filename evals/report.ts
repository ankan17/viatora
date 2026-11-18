import type { Check } from "./scenarios";
import type { Usage } from "./types";

export type RunRecord = {
  model: string;
  scenario: string;
  category: string;
  run: number;
  /** Every required check passed. */
  pass: boolean;
  skipped?: string;
  checks: Check[];
  turns: {
    reply: string;
    steps: number;
    calls: { name: string; isError: boolean }[];
    usage: Usage;
    ms: number;
    finished: boolean;
    error?: string;
  }[];
  /** Dollars, or null for a model with no price. */
  cost: number | null;
  judge?: { score: number; reason: string; cost: number } | null;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const pct = (xs: number[], p: number) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : 0;
const usd = (n: number | null, digits = 4) => (n == null ? "n/a" : `$${n.toFixed(digits)}`);
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

/** The numbers for one model across the runs that actually ran. */
export function summarise(runs: RunRecord[]) {
  const done = runs.filter((r) => !r.skipped);
  const turns = done.flatMap((r) => r.turns);
  const calls = turns.flatMap((t) => t.calls);
  const costs = done.map((r) => r.cost);
  const priced = costs.every((c) => c != null);
  const input = sum(turns.map((t) => t.usage.input));
  return {
    runs: done.length,
    passed: done.filter((r) => r.pass).length,
    turns: turns.length,
    cost: priced ? sum(costs as number[]) : null,
    perTurn: priced && turns.length ? sum(costs as number[]) / turns.length : null,
    steps: mean(turns.map((t) => t.steps)),
    errorRate: calls.length ? calls.filter((c) => c.isError).length / calls.length : 0,
    input: mean(turns.map((t) => t.usage.input)),
    cachedShare: input ? sum(turns.map((t) => t.usage.cachedInput)) / input : 0,
    output: mean(turns.map((t) => t.usage.output)),
    reasoning: mean(turns.map((t) => t.usage.reasoning)),
    p50: pct(
      turns.map((t) => t.ms / 1000),
      0.5,
    ),
    p95: pct(
      turns.map((t) => t.ms / 1000),
      0.95,
    ),
    softMisses: done.flatMap((r) => r.checks).filter((c) => c.soft && !c.pass).length,
    judge: mean(done.map((r) => r.judge?.score).filter((s): s is number => typeof s === "number" && !Number.isNaN(s))),
    judged: done.filter((r) => r.judge && !Number.isNaN(r.judge.score)).length,
  };
}

export function renderReport(runs: RunRecord[], opts: { turnsPerMonth: number; budget: number; spent: number; judge?: string }): string {
  const models = [...new Set(runs.map((r) => r.model))];
  const scenarios = [...new Set(runs.map((r) => r.scenario))];
  const categories = [...new Set(runs.map((r) => r.category))];
  const by = (m: string) => runs.filter((r) => r.model === m);
  const out: string[] = ["# Model eval", ""];

  const skipped = runs.filter((r) => r.skipped);
  if (skipped.length) out.push(`> ${skipped.length} runs were skipped (${[...new Set(skipped.map((r) => r.skipped))].join("; ")}).`, "");

  out.push("## Summary", "");
  out.push(
    table(
      [
        "model",
        "passed",
        "$/turn",
        `$/month at ${opts.turnsPerMonth.toLocaleString()} turns`,
        "steps",
        "tool errors",
        "in tokens",
        "cached",
        "out tokens",
        "p50 s",
        "p95 s",
        ...(opts.judge ? ["judge /5"] : []),
      ],
      models.map((m) => {
        const s = summarise(by(m));
        return [
          m,
          `${s.passed}/${s.runs}`,
          usd(s.perTurn),
          s.perTurn == null ? "n/a" : `$${(s.perTurn * opts.turnsPerMonth).toFixed(0)}`,
          s.steps.toFixed(1),
          `${(s.errorRate * 100).toFixed(0)}%`,
          k(s.input),
          `${(s.cachedShare * 100).toFixed(0)}%`,
          `${k(s.output)}${s.reasoning ? ` (${k(s.reasoning)} reasoning)` : ""}`,
          s.p50.toFixed(1),
          s.p95.toFixed(1),
          ...(opts.judge ? [s.judged ? s.judge.toFixed(1) : "-"] : []),
        ];
      }),
    ),
    "",
    "`passed` counts runs where every required check held. Costs are for the scenario mix below, each scenario weighted equally; scale by your own mix. `in tokens` includes cached ones.",
    "",
  );

  out.push("## By scenario", "", "Passed runs, then dollars per run.", "");
  out.push(
    table(
      ["scenario", "category", ...models],
      scenarios.map((sc) => [
        sc,
        runs.find((r) => r.scenario === sc)?.category ?? "",
        ...models.map((m) => {
          const rs = runs.filter((r) => r.model === m && r.scenario === sc && !r.skipped);
          if (!rs.length) return "skipped";
          const costs = rs.map((r) => r.cost);
          return `${rs.filter((r) => r.pass).length}/${rs.length} · ${costs.every((c) => c != null) ? usd(mean(costs as number[])) : "n/a"}`;
        }),
      ]),
    ),
    "",
  );

  out.push("## By category", "");
  out.push(
    table(
      ["category", ...models],
      categories.map((c) => [
        c,
        ...models.map((m) => {
          const rs = runs.filter((r) => r.model === m && r.category === c && !r.skipped);
          return rs.length ? `${Math.round((rs.filter((r) => r.pass).length / rs.length) * 100)}%` : "-";
        }),
      ]),
    ),
    "",
  );

  const failures = runs.filter((r) => !r.pass && !r.skipped);
  if (failures.length) {
    out.push("## Failures", "");
    const seen = new Map<string, number>();
    for (const r of failures) {
      const key = `${r.model}|${r.scenario}`;
      if ((seen.get(key) ?? 0) >= 2) continue; // two examples per model and scenario is plenty
      seen.set(key, (seen.get(key) ?? 0) + 1);
      const bad = r.checks.filter((c) => !c.pass && !c.soft);
      const crash = r.turns.find((t) => t.error)?.error;
      out.push(
        `- **${r.model}** / ${r.scenario} (run ${r.run + 1}): ${[...(crash ? [`error: ${crash}`] : []), ...bad.map((c) => (c.detail ? `${c.name} (${c.detail})` : c.name))].join("; ")}`,
      );
    }
    out.push("");
  }

  const soft = runs.flatMap((r) => r.checks.filter((c) => c.soft && !c.pass).map((c) => `${r.model} / ${r.scenario}: ${c.name}`));
  if (soft.length) out.push("## Soft checks missed", "", ...[...new Set(soft)].slice(0, 30).map((s) => `- ${s}`), "");

  const judged = runs.filter((r) => r.judge && !Number.isNaN(r.judge.score));
  if (judged.length) {
    out.push(
      "## Judge notes",
      "",
      ...judged.slice(0, 40).map((r) => `- ${r.model} / ${r.scenario}: ${r.judge!.score}/5, ${r.judge!.reason}`),
      "",
    );
  }

  out.push(`Spent on the models under test: ${usd(opts.spent, 2)} of a ${usd(opts.budget, 2)} budget.`, "");
  return out.join("\n");
}
