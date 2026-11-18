import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { ServerClient } from "@/lib/supabase/server";
import { loadItinerary } from "@/lib/itinerary/snapshot";
import { judgeReply, judgeSpec } from "./judge";
import { runEvalTurn, type History } from "./loop";
import { costOf, priceOf } from "./pricing";
import { makeProvider, missingKey, parseSpec } from "./providers";
import { renderReport, type RunRecord } from "./report";
import { SCENARIOS } from "./scenarios";
import { addUsage, noUsage } from "./types";
import { cleanup, dayIdOf, startLookups, stopLookups, type World } from "./world";

// Settings come from the environment; `pnpm eval` turns its flags into these.
const specs = (process.env.EVAL_MODELS ?? "mock:scripted")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const runsEach = Number(process.env.EVAL_RUNS ?? 3);
const only = process.env.EVAL_SCENARIOS?.split(",").map((s) => s.trim());
const budget = Number(process.env.EVAL_BUDGET ?? 5);
const concurrency = Number(process.env.EVAL_CONCURRENCY ?? 4);
const turnsPerMonth = Number(process.env.EVAL_TURNS_PER_MONTH ?? 3000);

const worlds: World[] = [];
beforeAll(startLookups);
afterAll(async () => {
  stopLookups();
  await cleanup(worlds);
});

it(
  "runs every scenario against every model",
  async () => {
    for (const spec of [...specs, ...(judgeSpec() ? [judgeSpec()!] : [])]) {
      const key = missingKey(spec);
      if (key) throw new Error(`${spec} needs ${key} in the environment.`);
      parseSpec(spec);
    }
    const scenarios = SCENARIOS.filter((s) => !only || only.includes(s.id));
    if (!scenarios.length) throw new Error(`No scenario matches ${only?.join(", ")}. Known: ${SCENARIOS.map((s) => s.id).join(", ")}`);

    for (const spec of specs) {
      if (!priceOf(parseSpec(spec).price)) console.warn(`No price for ${spec}: its cost will show as n/a. Add one with EVAL_PRICES.`);
    }

    // Interleave the models, so a budget stop leaves each with a similar number of runs.
    const jobs = Array.from({ length: runsEach }, (_, run) => scenarios.flatMap((sc) => specs.map((spec) => ({ spec, sc, run })))).flat();
    console.log(`${jobs.length} runs: ${specs.length} models x ${scenarios.length} scenarios x ${runsEach} runs. Budget $${budget}.`);

    const records: RunRecord[] = [];
    let spent = 0;
    const providers = new Map(specs.map((s) => [s, makeProvider(s)]));
    const queue = [...jobs];

    async function worker() {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { spec, sc, run } = job;
        const base = { model: spec, scenario: sc.id, category: sc.category, run };
        if (spent >= budget) {
          records.push({ ...base, pass: false, skipped: "budget reached", checks: [], turns: [], cost: 0 });
          continue;
        }
        const record = await playOne(spec, sc, run);
        spent += record.cost ?? 0;
        records.push(record);
        const failed = record.checks.filter((c) => !c.pass && !c.soft).map((c) => c.name);
        console.log(
          `${record.pass ? "pass" : "FAIL"}  ${spec}  ${sc.id}#${run + 1}  ${record.cost == null ? "" : `$${record.cost.toFixed(4)}`}${failed.length ? `  ${failed.join("; ")}` : ""}`,
        );
      }
    }

    async function playOne(spec: string, sc: (typeof SCENARIOS)[number], run: number): Promise<RunRecord> {
      const base = { model: spec, scenario: sc.id, category: sc.category, run };
      try {
        const world = await sc.setup();
        worlds.push(world);
        const db = world.db as unknown as ServerClient;
        const before = (await loadItinerary(db, world.tripId))!;
        const history: History = [];
        const turns = [];
        for (const t of sc.turns) {
          await t.before?.(world);
          const dayId = t.day ? await dayIdOf(world, t.day) : null;
          const res = await runEvalTurn(providers.get(spec)!, world, t.say, history, dayId);
          turns.push(res);
          history.push({ role: "user", text: t.say }, { role: "assistant", text: res.reply });
        }
        const after = (await loadItinerary(db, world.tripId))!;
        const checks = sc.grade({ turns, before, after, world });
        const usage = turns.reduce((u, t) => addUsage(u, t.usage), noUsage());
        const judge = sc.rubric
          ? await judgeReply(sc.rubric, sc.turns.map((t) => t.say).join(" / "), turns.at(-1)?.reply ?? "", after)
          : null;
        return {
          ...base,
          pass: checks.every((c) => c.pass || c.soft),
          checks,
          turns: turns.map(({ reply, steps, calls, usage, ms, finished, error }) => ({
            reply,
            steps,
            calls: calls.map((c) => ({ name: c.name, isError: c.isError })),
            usage,
            ms,
            finished,
            error,
          })),
          cost: costOf(priceOf(parseSpec(spec).price), usage),
          judge,
        };
      } catch (e) {
        return {
          ...base,
          pass: false,
          checks: [{ name: "run crashed", pass: false, detail: e instanceof Error ? e.message : String(e) }],
          turns: [],
          cost: 0,
        };
      }
    }

    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    records.sort((a, b) => a.model.localeCompare(b.model) || a.scenario.localeCompare(b.scenario) || a.run - b.run);

    const report = renderReport(records, { turnsPerMonth, budget, spent, judge: judgeSpec() });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    mkdirSync("evals/results", { recursive: true });
    writeFileSync(`evals/results/${stamp}.json`, JSON.stringify(records, null, 2));
    writeFileSync(`evals/results/${stamp}.md`, report);
    console.log(`\n${report}\nFull results: evals/results/${stamp}.json`);
    expect(records.length).toBe(jobs.length);
  },
  3 * 60 * 60 * 1000,
);
