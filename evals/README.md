# Model evals

Runs the app's real chat agent loop against different models and reports **cost**, **quality** and **speed** side by side. It spends real money on real APIs, so it is not part of `pnpm test` or CI.

## What it does

Each scenario seeds a fresh trip in the local Supabase, plays one or more chat turns through the same code the app uses (system prompt, tool definitions, trip snapshot, tool execution through `executeTool`), then checks the resulting database state and the reply. Only the model call differs between providers (`evals/providers/`).

- **Cost**: tokens from each provider's own usage report (input, cached input, output including reasoning), priced from `evals/pricing.ts`. Reported per turn and projected per month.
- **Quality**: rule-based checks on the plan and the reply (right edit, nothing else touched, no invented bookings, no markdown, hand edits trusted, injected list text ignored). Optional model-as-judge score for open-ended replies.
- **Speed**: model time per turn, p50 and p95.

15 scenarios across planning, editing, reasoning, lists, honesty, memory, safety, lookups and scale (`evals/scenarios.ts`). Lookups use the scripted stand-in (`tests/fake-model/server.mjs`) so runs are repeatable; `--live-lookups` uses the real services.

## Run it

```sh
pnpm db:start                      # local Supabase must be up
pnpm eval                          # free: the scripted mock, which should pass everything

export OPENAI_API_KEY=... GEMINI_API_KEY=... ANTHROPIC_API_KEY=...   # or put them in .env.local
pnpm eval --models anthropic:claude-opus-5-5,openai:gpt-5.4-mini,gemini:gemini-3.8-flash --runs 3 --budget 5
```

Options: `--models a,b` (`provider:model`, optionally `@low|medium|high` for thinking depth, e.g. `openai:gpt-5.4-mini@low`), `--runs N` (default 3: models are not deterministic, so look at pass rates), `--scenarios id,id`, `--budget USD` (default 5; the run stops starting new runs once reached), `--concurrency N`, `--judge provider:model`, `--prices "..."`, `--turns-per-month N`, `--live-lookups`.

Results go to `evals/results/<time>.md` (the report) and `.json` (everything, including replies), both git-ignored.

## Before trusting a number

- **Prices and model ids are unverified for everything but Anthropic.** `evals/pricing.ts` lists where each came from. Check the provider's pricing page and model list, and override with `--prices "openai:gpt-5.4-mini=0.75,0.075,4.5"` (input, cached input, output per million tokens).
- **Run the mock after changing a scenario or check.** It always answers correctly; if it fails a check, the check is wrong.
- A 3-run pass rate is a signal, not a measurement. Raise `--runs` before a decision.
- Cost per turn is for this scenario mix, weighted equally. The `big-trip` scenario shows what a 14-day trip costs; real usage mixes cheap and expensive turns.
- The app sends the same system prompt and tools to every model. A prompt tuned for one model may do better or worse on another; that is part of what you are measuring.
- Gemini and OpenAI adapters follow the SDK types but have not been run against the live APIs yet. The first real run may need an adapter fix.

## Adding a scenario

Add an entry to `SCENARIOS` with a `setup` (a seeded trip), the `turns` to say, and a `grade` that returns checks. Mark a check `soft` to report it without failing the run. Add the correct answer to `providers/mock.ts` and confirm `pnpm eval` still passes 100%.
