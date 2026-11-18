// pnpm eval --models mock:scripted --runs 3 --scenarios packing,record-booking --budget 5
import { spawnSync } from "node:child_process";

const flags = {
  "--models": "EVAL_MODELS",
  "--runs": "EVAL_RUNS",
  "--scenarios": "EVAL_SCENARIOS",
  "--budget": "EVAL_BUDGET",
  "--concurrency": "EVAL_CONCURRENCY",
  "--judge": "EVAL_JUDGE",
  "--prices": "EVAL_PRICES",
  "--turns-per-month": "EVAL_TURNS_PER_MONTH",
};
const env = { ...process.env };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--live-lookups") env.EVAL_LIVE_LOOKUPS = "1";
  else if (flags[args[i]] && args[i + 1]) env[flags[args[i]]] = args[++i];
  else {
    console.error(`Unknown or incomplete option ${args[i]}.\nOptions: ${Object.keys(flags).join(" ")} --live-lookups`);
    process.exit(2);
  }
}
for (const file of [".env.local"]) {
  try {
    process.loadEnvFile(file);
    Object.assign(env, Object.fromEntries(Object.entries(process.env).filter(([k]) => !(k in env))));
  } catch {}
}
process.exit(spawnSync("pnpm", ["exec", "vitest", "run", "--project", "eval"], { stdio: "inherit", env }).status ?? 1);
