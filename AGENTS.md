<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Viatora — Travel Planner AI

Chat-based trip planner. The itinerary in Postgres is the source of truth; the chat agent only edits it through tool calls. Plan: see `docs/milestones.md`.

## Run it

- `pnpm db:start` — local Supabase (Docker). Ports are 554xx because another project uses the 543xx defaults. Studio: http://127.0.0.1:55423, Mailpit (sign-in emails): http://127.0.0.1:55424.
- `pnpm dev` — app on http://localhost:3100 (3000 is taken on this machine; Supabase `site_url` matches 3100).
- Chat needs `ANTHROPIC_API_KEY` and `SUPABASE_SECRET_KEY` in `.env.local` (both server only; the secret key stores the assistant's replies). With no Anthropic credentials the app still runs and chat answers "Chat isn't set up on this server yet." The SDK also accepts `ANTHROPIC_AUTH_TOKEN` or an `ant auth login` profile, so a machine with either will call the real API.
- `pnpm check` — typecheck, lint, unit tests, database (RLS) tests. `pnpm test:e2e` — Playwright (`tests/e2e/`, phone and desktop), needs `pnpm db:start`, starts the dev server itself, pointed at a scripted stand-in for the model (`tests/fake-model/server.mjs`, port 3199) so chat tests are repeatable and free. A dev server you already have running is reused as it is: start it with `pnpm dev:test` when you want to run chat tests against it, or they will call the real model and fail.
- `pnpm test:visual` — screenshot tests (`tests/visual/`): every screen and dialog, phone and desktop, light and dark, compared with the images in `tests/visual/screenshots/`. Needs Docker and `pnpm db:start`. The browser runs in Playwright's Docker image so the pictures match CI; the app and Supabase stay on this machine. After an intended change to the look, run `pnpm test:visual --update-snapshots`, look at the changed images, and commit them. Add a `shot()` for each new screen, dialog or state.
- CI (`.github/workflows/ci.yml`) runs on every pull request and on `main`, in two jobs. One runs `pnpm check`, then fails on any database advisor finding and on `src/lib/database.types.ts` not matching the migrations. The other builds for production and runs the end-to-end and visual tests against that build. A failed run uploads the Playwright report, which shows expected, actual and difference for each screenshot.
- One test: `pnpm test src/lib/dates.test.ts` (unit, `src/**/*.test.ts`), `pnpm test:db tests/db/rls.test.ts -t "name"` (needs `pnpm db:start`), `pnpm test:e2e tests/e2e/itinerary.spec.ts --project <name>` (projects in `playwright.config.ts`); `pnpm test:visual -g "sign-in" --project phone`.

## How it fits together

- Trip page (`src/app/trips/[tripId]/page.tsx`) loads the whole trip once with `loadItinerary` (`src/lib/itinerary/snapshot.ts`) and hands it to `TripScreen`.
- Client components share state through `TripProvider` (`src/components/itinerary/trip-context.tsx`); its `run(op, input)` calls the `edit` / `undo` server actions in `src/app/trips/[tripId]/actions.ts` and shows the undo toast.
- Server actions dispatch to the ops in `src/lib/itinerary/ops.ts`. Each op validates with zod, writes through a client tagged with the batch headers, and returns a summary. Database triggers record the writes in `change_batches` / `change_log`; `undo_batch` reverts one batch.
- Chat: `Chat` (`src/components/chat/chat.tsx`) posts to `src/app/api/trips/[tripId]/chat/route.ts`, which streams `TurnEvent`s (`src/lib/agent/events.ts`) as newline-delimited JSON. `runTurn` (`src/lib/agent/run.ts`) stores the message, sends the model the earlier turns plus a fresh snapshot of the trip (`context.ts`), and loops while the model calls tools.
- The agent's tools (`src/lib/agent/tools.ts`) map onto the same ops (actor `agent`), so edits from chat and by hand share one path and one undo history. All edits in one reply join one change batch; the reply's card undoes them together.
- Messages live in `messages` (`parts`: text and edit summaries; `change_batch_id`: the card's batch). Travellers' messages are inserted as the user; replies are inserted with the secret key (`saveReply` in `src/lib/agent/store.ts`), because clients must not be able to write them. `src/lib/agent/messages.ts` is the pure half (shapes, history, merging) and is safe to import from client components; `store.ts` is server only. The model is never sent old tool calls: what they did is in the snapshot, along with the latest changes made by hand.

## Conventions

- Next 16 with `cacheComponents`: anything that reads cookies or the database sits under `<Suspense>`. The server Supabase client calls `connection()` for this reason. Middleware is `src/proxy.ts`.
- Schema changes: add a migration in `supabase/migrations/` (write the file directly; `supabase migration new` waits on stdin), then `pnpm db:reset && pnpm db:types`. Run `supabase db advisors --local` and keep it at zero findings.
- Every table is trip-scoped and guarded by `can_read_trip` / `can_edit_trip`. Add an RLS test in `tests/db/` for every new table or policy.
- Visual tests compare pixels with no tolerance. The images were made on arm64 Linux (the Docker browser on an Apple Silicon Mac), so only regenerate them on arm64, and keep the CI browser job on an arm64 runner. Expect to regenerate them after a Playwright upgrade, since the browser changes with it.
- Nothing that differs between runs may show in a screenshot: seed trips through `tests/visual/helpers.ts` with fixed names and dates, use a fixed email where the page shows it, and pause the page clock for anything on a timer (see `item-added` in `tests/visual/screens.spec.ts`).
- Places: Google rows store the place ID only (enforced by a check constraint). Add places via the `ensure_place` RPC.
- Items with `day_id = null` are the ideas backlog.
- Edits go through `applyEdit` in `src/lib/itinerary/ops.ts`. Never write itinerary tables from UI code directly. Writes carry `x-change-batch` / `x-change-actor` / `x-change-summary` (base64) headers; triggers log them for undo. RPCs that set up data rather than edit it (like `create_trip`) set `app.skip_log`.
- `can_read_trip` / `can_edit_trip` must never return null (plpgsql `if not null` passes). Keep the `coalesce`.
- A new kind of edit is an op in `ops.ts` (its input schema in `schemas.ts`) first, then a tool in `src/lib/agent/tools.ts` that maps to it (the model names days by number and items by id; `toOp` translates). Tools never write tables themselves. Add a script to the fake model when a test needs the model to call it.
- Model, effort and the system prompt are in `src/lib/agent/model.ts`. Replies are shown as plain text (no Markdown rendering), and the prompt says so.
- Day dates are derived: `trips.start_date + (number - 1)`. See `src/lib/dates.ts`.
- Styling uses design-system tokens only (`bg-ground`, `bg-raised`, `bg-blush`, `text-ink`, `text-muted`, `border-hairline`, `border-outline`, `bg-plum`, `text-on-plum`; text sizes `text-display/title/heading/body/caption/label`). Source: https://claude.ai/artifact/WZ69JU2DQXvSu7fwGBtJJm. One accent (plum). Tap targets ≥ 44px (`min-h-11`).
